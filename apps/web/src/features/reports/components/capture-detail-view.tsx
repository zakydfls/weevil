'use client';

import { type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Database,
  FileCode2,
  FileText,
  Gauge,
  Globe,
  Home,
  Info,
  Link2,
  ListTree,
  Loader2,
  MousePointer2,
  Play,
  RefreshCcw,
  Search,
  Send,
  Server,
  Terminal,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Input } from '@/components/ui/input';
import type { BackendTraceEntry, NetworkRequestEntry, ReportDetail, TimelineEntry } from '@/lib/api/types';
import { apiClient } from '@/lib/api/client';
import { formatBytes, formatDate } from '@/lib/utils';
import { reportKeys } from '../queries';

interface CaptureDetailViewProps {
  report: ReportDetail | undefined;
  isLoading: boolean;
  onBack: () => void;
}

type DevToolsTab =
  | 'Timeline'
  | 'Info'
  | 'Console'
  | 'Network'
  | 'Actions'
  | 'Errors'
  | 'Performance'
  | 'DOM'
  | 'Backend';

const devToolsTabItems = [
  { id: 'Info', icon: Info },
  { id: 'Console', icon: Terminal },
  { id: 'Network', icon: Wifi },
  { id: 'Backend', icon: Server },
] satisfies Array<{ id: DevToolsTab; icon: typeof Clock }>;
const networkFilterLabels = ['All', 'Fetch/XHR', 'WS', 'JS', 'CSS', 'Media', 'Font', 'Doc', 'Other'] as const;
type NetworkFilter = (typeof networkFilterLabels)[number];
type NetworkDetailTab = 'Headers' | 'Request' | 'Response';
type BodyViewMode = 'tree' | 'raw';
type CopyFeedbackTarget = 'link' | 'send' | 'curl' | 'response' | null;
interface BodyPreviewResult {
  body: string;
  label: string;
  note: string | null;
  parsedJson?: unknown;
}

const networkDetailTabs: NetworkDetailTab[] = ['Headers', 'Request', 'Response'];
const MIN_DEVTOOLS_WIDTH = 460;
const MAX_DEVTOOLS_WIDTH = 920;
const MIN_NETWORK_LIST_WIDTH = 176;
const MAX_NETWORK_LIST_WIDTH = 360;

export function CaptureDetailView({
  report,
  isLoading,
  onBack,
}: CaptureDetailViewProps) {
  const [activeTab, setActiveTab] = useState<DevToolsTab>('Info');
  const [commentBody, setCommentBody] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(true);
  const [devToolsWidth, setDevToolsWidth] = useState(640);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedbackTarget>(null);
  const queryClient = useQueryClient();
  const comments = report?.comments ?? [];

  async function handleCreateComment() {
    if (!report || !commentBody.trim()) {
      return;
    }

    setIsPostingComment(true);
    try {
      await apiClient.createComment(report.id, commentBody);
      setCommentBody('');
      await queryClient.invalidateQueries({ queryKey: reportKeys.detail(report.id) });
      await queryClient.invalidateQueries({ queryKey: reportKeys.all });
    } finally {
      setIsPostingComment(false);
    }
  }

  async function handleCopyLink() {
    if (!report) {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set('capture', report.id);
    await writeClipboard(url.toString());
    setCopyFeedback('link');
    window.setTimeout(() => setCopyFeedback(null), 1_400);
  }

  async function handleSendToApp() {
    if (!report) {
      return;
    }

    await writeClipboard(
      JSON.stringify(
        {
          id: report.id,
          title: report.title,
          status: report.status,
          pageUrl: report.pageUrl,
          shareToken: report.shareToken,
          counts: {
            console: report.consoleLogs.length,
            network: report.networkRequests.length,
            actions: report.pageActions.length,
            errors: report.runtimeErrors.length,
            performance: report.performanceEntries.length,
            dom: report.domEvents.length,
            backend: report.backendTraces.length,
          },
        },
        null,
        2,
      ),
    );
    setCopyFeedback('send');
    window.setTimeout(() => setCopyFeedback(null), 1_400);
  }

  function handleDevToolsResize(event: ReactPointerEvent<HTMLDivElement>) {
    const startWidth = devToolsWidth;
    startHorizontalResize(event, (deltaX) => {
      const maxWidth = Math.min(MAX_DEVTOOLS_WIDTH, window.innerWidth - 420);
      setDevToolsWidth(clamp(startWidth - deltaX, MIN_DEVTOOLS_WIDTH, maxWidth));
    });
  }

  if (isLoading || !report) {
    return (
      <section className="min-h-[calc(100vh-1rem)] rounded-2xl border border-[#e2e0dc] bg-white p-8">
        <div className="h-10 w-40 animate-pulse rounded bg-[#efeeeb]" />
        <div className="mt-8 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_36rem]">
          <div className="aspect-video animate-pulse rounded-2xl bg-[#efeeeb]" />
          <div className="animate-pulse rounded-2xl bg-[#efeeeb]" />
        </div>
      </section>
    );
  }

  return (
    <section
      data-shell-mode="detail"
      className={`weevil-fade-in grid h-screen max-h-screen overflow-hidden bg-[#f7f8ff] transition-[grid-template-columns] duration-200 ease-out ${
        isDevToolsOpen ? 'xl:[grid-template-columns:minmax(0,1fr)_var(--devtools-width)]' : ''
      }`}
      style={{ '--devtools-width': `${devToolsWidth}px` } as CSSProperties}
    >
      <div className="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden bg-white">
        <header className="flex min-h-16 flex-col items-start justify-between gap-3 border-b border-[#dfe5f5] bg-white/95 px-4 py-3 sm:flex-row sm:items-center lg:px-6">
          <div className="flex items-center gap-3">
            <Button type="button" variant="secondary" size="icon" className="rounded-xl" onClick={onBack}>
              <Home className="h-5 w-5" aria-hidden />
            </Button>
            <button type="button" onClick={onBack} className="flex items-center gap-2 text-[#64708a]">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Captures
            </button>
          </div>
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
            {!isDevToolsOpen ? (
              <Button
                type="button"
                variant="secondary"
                className="h-9 rounded-xl px-3 text-sm"
                onClick={() => setIsDevToolsOpen(true)}
              >
                DevTools
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className="h-9 rounded-xl border-[#dfe5f5] bg-white px-3 text-sm text-[#25324d] hover:bg-[#f2f5ff]"
              onClick={() => void handleSendToApp()}
            >
              {copyFeedback === 'send' ? <Check className="h-4 w-4" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              {copyFeedback === 'send' ? 'Copied payload' : 'Send to app'}
              <ChevronDown className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              className="h-9 rounded-xl bg-[#2563eb] px-4 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
              onClick={() => void handleCopyLink()}
            >
              {copyFeedback === 'link' ? <Check className="h-5 w-5" aria-hidden /> : <Link2 className="h-5 w-5" aria-hidden />}
              {copyFeedback === 'link' ? 'Copied' : 'Copy link'}
              <ChevronDown className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </header>

        <div className="thin-scrollbar min-h-0 overflow-auto px-4 py-5 lg:px-6 lg:py-6">
          <div className={isDevToolsOpen ? '' : 'mx-auto max-w-[108rem]'}>
          <RecordingHero report={report} />
          <CaptureStats report={report} />
          <div className={isDevToolsOpen ? 'mt-6 max-w-4xl' : 'mt-6'}>
            <h1 className="text-2xl font-semibold tracking-normal text-[#16213a]">{report.title}</h1>
            <p className="mt-3 text-base leading-7 text-[#64708a] sm:text-lg">
              {report.description || 'Add a description...'}
            </p>
            <div className="mt-6 border-t border-[#dfe5f5] pt-5">
              <div className="flex items-center gap-2 text-sm text-[#4b5875]">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f97316] text-xs font-semibold text-white">
                  W
                </div>
                Weevil created this capture · {formatDate(report.createdAt)}
              </div>
            </div>
            <div className="weevil-card-hover mt-5 rounded-xl border border-[#dfe5f5] bg-white p-3 shadow-sm hover:border-[#c8d7f5]">
              <Textarea
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                className="min-h-16 border-0 p-0 text-base shadow-none focus:ring-0"
                placeholder="Write a comment or @ to mention"
              />
              <div className="mt-4 flex items-center justify-between text-[#64708a]">
                <Link2 className="h-5 w-5" aria-hidden />
                <Button
                  type="button"
                  size="sm"
                  disabled={isPostingComment || !commentBody.trim()}
                  onClick={() => void handleCreateComment()}
                >
                  {isPostingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send
                </Button>
              </div>
            </div>
            {comments.length > 0 ? (
              <div className="mt-6 space-y-3">
                {comments.map((comment) => (
                  <div key={comment.id} className="rounded-2xl bg-[#f7f9ff] p-4">
                    <div className="text-sm font-semibold">{comment.authorName}</div>
                    <div className="mt-1 text-sm text-[#4b5875]">{comment.body}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          </div>
        </div>

        {isDevToolsOpen ? (
        <div className="border-t border-[#dfe5f5] bg-[#f8faff] xl:hidden">
          <DevToolsShell
            report={report}
            activeTab={activeTab}
            onActiveTabChange={setActiveTab}
            onClose={() => setIsDevToolsOpen(false)}
            isCompact
          />
        </div>
        ) : null}
      </div>

      {isDevToolsOpen ? (
      <aside className="relative hidden h-screen min-h-0 border-l border-[#dfe5f5] bg-[#f8faff] xl:grid">
        <ResizeGrip
          label="Resize DevTools"
          className="absolute -left-1 top-0 z-20 h-full w-2 cursor-col-resize"
          onPointerDown={handleDevToolsResize}
        />
        <DevToolsShell
          report={report}
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
          onClose={() => setIsDevToolsOpen(false)}
        />
      </aside>
      ) : null}
    </section>
  );
}

function DevToolsShell({
  report,
  activeTab,
  onActiveTabChange,
  onClose,
  isCompact = false,
}: {
  report: ReportDetail;
  activeTab: DevToolsTab;
  onActiveTabChange: (tab: DevToolsTab) => void;
  onClose: () => void;
  isCompact?: boolean;
}) {
  return (
    <div className={isCompact ? 'grid h-[min(34rem,76vh)] min-h-0 grid-rows-[auto_auto_1fr]' : 'grid h-full min-h-0 grid-rows-[auto_auto_1fr]'}>
      <div className="flex h-11 items-center justify-between border-b border-[#dfe5f5] bg-white px-3">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#e0ecff] text-[#2563eb]">
            <Zap className="h-3.5 w-3.5" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-normal text-[#16213a]">DevTools</h2>
            <div className="text-[10px] leading-none text-[#7a849d]">Synchronized telemetry</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[#7a849d]">
          <Button type="button" variant="secondary" size="icon" className="h-8 w-8 rounded-lg" onClick={onClose}>
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>
      <div className="scrollbar-none flex h-9 items-end gap-1 overflow-x-auto border-b border-[#dfe5f5] bg-[#fbfcff] px-2.5">
        {devToolsTabItems.map(({ id: tab, icon: Icon }) => (
          <button
            key={tab}
            type="button"
            onClick={() => onActiveTabChange(tab)}
            className={`relative flex h-7 shrink-0 items-center gap-1 rounded-t-md px-2 text-[11px] transition-colors ${
              activeTab === tab ? 'bg-white font-semibold text-[#2563eb]' : 'text-[#64708a] hover:bg-white/70'
            }`}
          >
            <Icon className="h-3 w-3" aria-hidden />
            {tab}
            {activeTab === tab ? (
              <span className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-t-full bg-[#f97316]" />
            ) : null}
          </button>
        ))}
      </div>
      <DevToolsPanel report={report} activeTab={activeTab} />
    </div>
  );
}

function jsonRecordEntries(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value).map(([key, entryValue]) => [
    key,
    typeof entryValue === 'string' ? entryValue : JSON.stringify(entryValue),
  ]);
}

function BodyPreview({
  title,
  value,
  headers,
  viewMode = 'tree',
}: {
  title: string;
  value?: string | null;
  headers?: unknown;
  viewMode?: BodyViewMode;
}) {
  if (!value) {
    return null;
  }

  const formatted = formatBodyPreview(value, headers);

  return (
    <>
      <SectionTitle title={title} />
      <div className="border-b border-[#efeeeb]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f3f1ed] px-3 py-1.5 text-[11px] text-[#77736d]">
          <span>{formatted.label}</span>
          <span>{formatByteCount(new Blob([value]).size)}</span>
        </div>
        {formatted.note ? (
          <div className="border-b border-[#f3f1ed] bg-[#fbfbfa] px-3 py-1.5 text-[11px] leading-4 text-[#5f5a55]">
            {formatted.note}
          </div>
        ) : null}
        {'parsedJson' in formatted && viewMode === 'tree' ? (
          <JsonTreeView value={formatted.parsedJson} />
        ) : (
          <pre className="max-h-[30rem] overflow-auto whitespace-pre px-3 py-2 font-mono text-[11px] leading-4 text-[#242321]">
            {viewMode === 'raw' ? value : formatted.body}
          </pre>
        )}
      </div>
    </>
  );
}

function JsonTreeView({ value }: { value: unknown }) {
  return (
    <div className="thin-scrollbar max-h-[30rem] overflow-auto px-2 py-1.5 font-mono text-[11px] leading-4 text-[#242321]">
      <JsonTreeNode name={null} value={value} defaultExpanded depth={0} />
    </div>
  );
}

function JsonTreeNode({
  name,
  value,
  defaultExpanded = true,
  depth,
}: {
  name: string | number | null;
  value: unknown;
  defaultExpanded?: boolean;
  depth: number;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const isArray = Array.isArray(value);
  const isObject = Boolean(value) && typeof value === 'object' && !isArray;
  const isExpandable = isArray || isObject;
  const entries = isArray
    ? value.map((entry, index) => [index, entry] as const)
    : isObject
      ? Object.entries(value as Record<string, unknown>)
      : [];

  if (!isExpandable) {
    return (
      <div className="flex min-w-0 items-start gap-1 py-0.5" style={{ paddingLeft: `${depth * 12}px` }}>
        {name !== null ? <span className="shrink-0 text-[#7a849d]">{formatJsonKey(name)}:</span> : null}
        <JsonPrimitive value={value} />
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        className="flex w-full min-w-0 items-center gap-1 py-0.5 text-left hover:bg-[#f4f7ff]"
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        <span className="w-3 shrink-0 text-[#7a849d]">{isExpanded ? '▾' : '▸'}</span>
        {name !== null ? <span className="shrink-0 text-[#7a849d]">{formatJsonKey(name)}:</span> : null}
        <span className="text-[#475569]">
          {isArray ? '[' : '{'}
          {!isExpanded ? `${entries.length} ${isArray ? 'items' : 'keys'}${isArray ? ']' : '}'}` : ''}
        </span>
      </button>
      {isExpanded ? (
        <>
          {entries.map(([entryName, entryValue]) => (
            <JsonTreeNode key={String(entryName)} name={entryName} value={entryValue} depth={depth + 1} />
          ))}
          <div className="py-0.5 text-[#475569]" style={{ paddingLeft: `${depth * 12 + 12}px` }}>
            {isArray ? ']' : '}'}
          </div>
        </>
      ) : null}
    </div>
  );
}

function JsonPrimitive({ value }: { value: unknown }) {
  if (typeof value === 'string') {
    return <span className="break-all text-[#047857]">{JSON.stringify(value)}</span>;
  }

  if (typeof value === 'number') {
    return <span className="text-[#1d4ed8]">{value}</span>;
  }

  if (typeof value === 'boolean') {
    return <span className="text-[#b45309]">{String(value)}</span>;
  }

  if (value === null) {
    return <span className="text-[#7a849d]">null</span>;
  }

  return <span className="break-all text-[#475569]">{String(value)}</span>;
}

function formatJsonKey(key: string | number) {
  return typeof key === 'number' ? key : JSON.stringify(key);
}

function CaptureStats({ report }: { report: ReportDetail }) {
  const stats = [
    { label: 'Sessions', value: report.captureSessions?.length ?? 0, icon: Clock, accent: 'text-[#2563eb]', bg: 'bg-[#eff6ff]', ring: 'ring-[#bfdbfe]' },
    { label: 'Actions', value: report.pageActions?.length ?? 0, icon: MousePointer2, accent: 'text-[#7c3aed]', bg: 'bg-[#f5f3ff]', ring: 'ring-[#ddd6fe]' },
    { label: 'Errors', value: report.runtimeErrors?.length ?? 0, icon: AlertTriangle, accent: 'text-[#e11d48]', bg: 'bg-[#fff1f2]', ring: 'ring-[#fecdd3]' },
    { label: 'Network', value: report.networkRequests?.length ?? 0, icon: Activity, accent: 'text-[#0891b2]', bg: 'bg-[#ecfeff]', ring: 'ring-[#a5f3fc]' },
    { label: 'Perf', value: report.performanceEntries?.length ?? 0, icon: Gauge, accent: 'text-[#b45309]', bg: 'bg-[#fffbeb]', ring: 'ring-[#fde68a]' },
    { label: 'Backend', value: report.backendTraces?.length ?? 0, icon: Database, accent: 'text-[#047857]', bg: 'bg-[#ecfdf5]', ring: 'ring-[#bbf7d0]' },
  ] as const;

  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className="weevil-metric-card weevil-soft-rise rounded-xl border border-[#dfe5f5] bg-white px-3 py-2.5 shadow-[0_8px_22px_rgba(21,32,54,0.05)]"
          style={{ animationDelay: `${index * 26}ms` }}
        >
          <div className="relative z-10 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[11px] font-semibold text-[#64708a]">{stat.label}</div>
              <div className="mt-1 text-2xl font-semibold leading-none text-[#16213a]">{stat.value}</div>
            </div>
            <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${stat.bg} ${stat.accent} ring-1 ${stat.ring}`}>
              <stat.icon className="h-4 w-4" aria-hidden />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecordingHero({ report }: { report: ReportDetail }) {
  const recordingUpload = report.uploads.find((item) => item.kind === 'SCREEN_RECORDING');
  const screenshotUpload = report.uploads.find((item) => item.kind === 'SCREENSHOT');
  const upload = recordingUpload ?? screenshotUpload;
  const isScreenshot = upload?.kind === 'SCREENSHOT';
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [hasLoadedThumbnail, setHasLoadedThumbnail] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const uploadId = upload?.id;

  useEffect(() => {
    let isMounted = true;

    async function loadThumbnailSource() {
      setIsPlayerOpen(false);
      setHasLoadedThumbnail(false);
      setVideoError(null);
      setSourceUrl(null);

      if (!uploadId) {
        return;
      }

      setIsLoadingSource(true);
      try {
        const response = await apiClient.getDownloadUrl(report.id, uploadId);
        if (isMounted) {
          setSourceUrl(response.getUrl);
        }
      } catch (error) {
        if (isMounted) {
          setVideoError(error instanceof Error ? error.message : 'Unable to load recording thumbnail');
        }
      } finally {
        if (isMounted) {
          setIsLoadingSource(false);
        }
      }
    }

    void loadThumbnailSource();

    return () => {
      isMounted = false;
    };
  }, [report.id, uploadId]);

  async function loadRecording() {
    if (!upload) {
      return;
    }

    if (sourceUrl) {
      setIsPlayerOpen(true);
      window.setTimeout(() => {
        void videoRef.current?.play().catch(() => undefined);
      }, 0);
      return;
    }

    setIsLoadingSource(true);
    setVideoError(null);
    try {
      const response = await apiClient.getDownloadUrl(report.id, upload.id);
      setSourceUrl(response.getUrl);
      setIsPlayerOpen(true);
      window.setTimeout(() => {
        void videoRef.current?.play().catch(() => {
          // Browsers may block autoplay; controls remain visible for manual play.
        });
      }, 0);
    } catch (error) {
      setVideoError(error instanceof Error ? error.message : 'Unable to load recording');
    } finally {
      setIsLoadingSource(false);
    }
  }

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (!isPlayerOpen) {
      const seekTo = Number.isFinite(video.duration) && video.duration > 0.6 ? 0.6 : 0.1;
      try {
        video.currentTime = seekTo;
      } catch {
        setHasLoadedThumbnail(true);
      }
      return;
    }

    if (Number.isFinite(video.duration)) {
      return;
    }

    const wasPaused = video.paused;
    const restorePlayback = () => {
      video.currentTime = 0;
      if (!wasPaused) {
        void video.play().catch(() => undefined);
      }
    };

    video.addEventListener('timeupdate', restorePlayback, { once: true });
    try {
      video.currentTime = Number.MAX_SAFE_INTEGER;
    } catch {
      video.removeEventListener('timeupdate', restorePlayback);
    }
  }

  return (
    <div
      className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-[#dfe7fb] shadow-sm ring-1 ring-[#dfe5f5]"
    >
      {sourceUrl ? (
        <>
          {isScreenshot ? (
            <img
              className="h-full w-full bg-[#f8faff] object-contain"
              src={sourceUrl}
              alt={report.title}
              onLoad={() => setHasLoadedThumbnail(true)}
              onError={() => setVideoError('Screenshot file cannot be loaded.')}
            />
          ) : (
            <video
              ref={videoRef}
              className={`h-full w-full bg-black ${isPlayerOpen ? 'object-contain' : 'object-cover'}`}
              src={sourceUrl}
              controls={isPlayerOpen}
              muted={!isPlayerOpen}
              playsInline
              preload="metadata"
              onLoadedMetadata={handleLoadedMetadata}
              onLoadedData={() => setHasLoadedThumbnail(true)}
              onCanPlay={() => setHasLoadedThumbnail(true)}
              onSeeked={() => setHasLoadedThumbnail(true)}
              onError={() => setVideoError('Recording file cannot be played. The uploaded WebM may be invalid or unreachable.')}
            />
          )}
          {!isPlayerOpen && !isScreenshot ? (
            <>
              <div
                className={`absolute inset-0 bg-[linear-gradient(135deg,#2563eb,#f97316_48%,#f8fafc)] transition-opacity ${
                  hasLoadedThumbnail ? 'opacity-0' : 'opacity-100'
                }`}
              />
              <div className="absolute inset-0 bg-black/30" />
              <button
                type="button"
                onClick={() => void loadRecording()}
                disabled={isLoadingSource}
                className="absolute left-1/2 top-1/2 flex h-[4.5rem] w-[4.5rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#16213a] shadow-[0_0_0_7px_rgba(255,255,255,0.22)]"
                aria-label="Play recording"
              >
                {isLoadingSource ? (
                  <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
                ) : (
                  <Play className="ml-1 h-9 w-9 fill-[#16213a]" aria-hidden />
                )}
              </button>
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-xl bg-black/82 px-3 py-1.5 text-base font-medium text-white">
                {upload ? formatBytes(upload.byteSize) : 'No recording'}
              </div>
            </>
          ) : null}
          {isScreenshot ? (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-xl bg-black/82 px-3 py-1.5 text-base font-medium text-white">
              Screenshot · {formatBytes(upload?.byteSize)}
            </div>
          ) : null}
          {videoError ? (
            <RecordingErrorOverlay
              message={videoError}
              onRetry={() => {
                setSourceUrl(null);
                setVideoError(null);
                if (!isScreenshot) {
                  void loadRecording();
                }
              }}
              sourceUrl={sourceUrl}
            />
          ) : null}
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#2563eb,#f97316_48%,#f8fafc)]" />
          <div className="absolute inset-0 bg-black/42" />
          <button
            type="button"
            onClick={() => void loadRecording()}
            disabled={!upload || isLoadingSource}
            className="absolute left-1/2 top-1/2 flex h-[4.5rem] w-[4.5rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#16213a] shadow-[0_0_0_7px_rgba(255,255,255,0.22)]"
          >
            {isLoadingSource ? (
              <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
            ) : (
              <Play className="ml-1 h-9 w-9 fill-[#16213a]" aria-hidden />
            )}
          </button>
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-xl bg-black/82 px-3 py-1.5 text-base font-medium text-white">
            {upload ? `${isScreenshot ? 'Screenshot' : 'Recording'} · ${formatBytes(upload.byteSize)}` : 'No recording'}
          </div>
          {videoError ? (
            <div className="absolute bottom-20 left-1/2 max-w-[80%] -translate-x-1/2 rounded-xl bg-[#dc2626] px-4 py-2 text-center text-sm font-medium text-white">
              {videoError}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function RecordingErrorOverlay({
  message,
  onRetry,
  sourceUrl,
}: {
  message: string;
  onRetry: () => void;
  sourceUrl: string;
}) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-black/72 p-6 text-center text-white">
      <div className="max-w-md">
        <AlertTriangle className="mx-auto h-9 w-9 text-[#fca5a5]" aria-hidden />
        <div className="mt-3 text-lg font-semibold">Recording cannot be played</div>
        <p className="mt-2 text-sm leading-6 text-white/78">{message}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button type="button" variant="secondary" onClick={onRetry}>
            Retry
          </Button>
          <Button type="button" onClick={() => window.open(sourceUrl, '_blank', 'noopener,noreferrer')}>
            Open file
          </Button>
        </div>
      </div>
    </div>
  );
}

function DevToolsPanel({ report, activeTab }: { report: ReportDetail; activeTab: DevToolsTab }) {
  if (activeTab === 'Timeline') {
    return <TimelinePanel entries={report.timeline ?? []} />;
  }

  if (activeTab === 'Info') {
    const session = report.captureSessions?.[0];

    return (
      <div className="thin-scrollbar h-full min-h-0 overflow-auto p-5">
        <KeyValue label="URL" value={report.pageUrl ?? 'n/a'} />
        <KeyValue label="Browser" value={[report.browserName, report.browserVersion].filter(Boolean).join(' ') || 'n/a'} />
        <KeyValue label="OS" value={report.osName ?? 'n/a'} />
        <KeyValue label="Viewport" value={report.viewportWidth && report.viewportHeight ? `${report.viewportWidth} x ${report.viewportHeight}` : 'n/a'} />
        <SectionTitle title="Capture Session" />
        <KeyValue label="Status" value={session?.status ?? 'n/a'} />
        <KeyValue label="Duration" value={formatDuration(session?.durationMs)} />
        <KeyValue label="Timezone" value={session?.timezone ?? 'n/a'} />
        <KeyValue label="Locale" value={session?.locale ?? 'n/a'} />
        <KeyValue label="Extension" value={session?.extensionVersion ?? 'n/a'} />
        <KeyValue label="Screen" value={session?.screenWidth && session?.screenHeight ? `${session.screenWidth} x ${session.screenHeight}` : 'n/a'} />
      </div>
    );
  }

  if (activeTab === 'Console') {
    return <ConsoleActivityPanel report={report} />;
  }

  if (activeTab === 'Network') {
    return <NetworkPanel report={report} />;
  }

  if (activeTab === 'Actions') {
    return (
      <div className="thin-scrollbar h-full min-h-0 overflow-auto p-5">
        <PanelEmptyState isEmpty={report.pageActions.length === 0} label="No user actions yet." />
        {report.pageActions.map((entry) => (
          <TelemetryCard
            key={entry.id}
            title={entry.kind}
            subtitle={entry.label ?? entry.selector ?? entry.textPreview ?? 'Action'}
            tone="info"
            timestamp={entry.occurredAt}
            offsetMs={entry.offsetMs}
            rows={[
              ['Selector', entry.selector ?? 'n/a'],
              ['Node path', entry.nodePath ?? 'n/a'],
              ['Tag', entry.tagName ?? 'n/a'],
              ['Text', entry.textPreview ?? 'n/a'],
              ['Value', entry.valuePreview ?? 'n/a'],
              ['Position', typeof entry.x === 'number' && typeof entry.y === 'number' ? `${entry.x}, ${entry.y}` : 'n/a'],
              ['Page URL', entry.pageUrl ?? 'n/a'],
            ]}
          />
        ))}
      </div>
    );
  }

  if (activeTab === 'Errors') {
    return (
      <div className="thin-scrollbar h-full min-h-0 overflow-auto p-5">
        <PanelEmptyState isEmpty={report.runtimeErrors.length === 0} label="No runtime errors yet." />
        {report.runtimeErrors.map((entry) => (
          <TelemetryCard
            key={entry.id}
            title={entry.kind}
            subtitle={entry.message}
            tone="danger"
            timestamp={entry.occurredAt}
            offsetMs={entry.offsetMs}
            rows={[
              ['Source', entry.sourceUrl ?? 'n/a'],
              ['Line', entry.lineNumber ? `${entry.lineNumber}:${entry.columnNumber ?? 0}` : 'n/a'],
              ['Stack', entry.stack ?? 'n/a'],
              ['Component stack', entry.componentStack ?? 'n/a'],
              ['Page URL', entry.pageUrl ?? 'n/a'],
            ]}
          />
        ))}
      </div>
    );
  }

  if (activeTab === 'Performance') {
    return (
      <div className="thin-scrollbar h-full min-h-0 overflow-auto p-5">
        <PanelEmptyState
          isEmpty={report.performanceEntries.length === 0}
          label="No performance entries yet."
        />
        {report.performanceEntries.map((entry) => (
          <TelemetryCard
            key={entry.id}
            title={entry.name}
            subtitle={entry.rating ?? entry.kind}
            tone={entry.rating === 'poor' ? 'warning' : 'neutral'}
            timestamp={entry.occurredAt}
            offsetMs={entry.offsetMs}
            rows={[
              ['Kind', entry.kind],
              ['Value', entry.value === null || entry.value === undefined ? 'n/a' : String(entry.value)],
              ['Start', entry.startTimeMs === null || entry.startTimeMs === undefined ? 'n/a' : `${entry.startTimeMs} ms`],
              ['Duration', entry.durationMs === null || entry.durationMs === undefined ? 'n/a' : `${entry.durationMs} ms`],
              ['Initiator', entry.initiatorType ?? 'n/a'],
              ['Page URL', entry.pageUrl ?? 'n/a'],
            ]}
          />
        ))}
      </div>
    );
  }

  if (activeTab === 'DOM') {
    return (
      <div className="thin-scrollbar h-full min-h-0 overflow-auto p-5">
        <PanelEmptyState isEmpty={report.domEvents.length === 0} label="No DOM events yet." />
        {report.domEvents.map((entry) => (
          <TelemetryCard
            key={entry.id}
            title={entry.kind}
            subtitle={entry.selector ?? entry.nodePath ?? entry.mutationType ?? 'DOM event'}
            tone="neutral"
            timestamp={entry.occurredAt}
            offsetMs={entry.offsetMs}
            rows={[
              ['Selector', entry.selector ?? 'n/a'],
              ['Node path', entry.nodePath ?? 'n/a'],
              ['Mutation', entry.mutationType ?? 'n/a'],
              ['Previous', entry.previousValue ?? 'n/a'],
              ['Next', entry.nextValue ?? 'n/a'],
              ['Attributes', stringify(entry.attributes)],
              ['Page URL', entry.pageUrl ?? 'n/a'],
            ]}
          />
        ))}
      </div>
    );
  }

  if (activeTab === 'Backend') {
    return <BackendPanel traces={report.backendTraces} />;
  }

  return (
    <div className="thin-scrollbar h-full min-h-0 overflow-auto p-5">
      {report.events.map((event) => (
        <div key={event.id} className="mb-3 rounded-xl border border-[#e2e0dc] bg-white p-4">
          <div className="font-semibold">{event.kind}</div>
          <div className="mt-1 text-sm text-[#77736d]">{formatDate(event.createdAt)}</div>
        </div>
      ))}
    </div>
  );
}

function BackendPanel({ traces }: { traces: BackendTraceEntry[] }) {
  const [query, setQuery] = useState('');
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(traces[0]?.id ?? null);
  const filteredTraces = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return traces;
    }

    return traces.filter((trace) =>
      [
        trace.operationName,
        trace.serviceName ?? '',
        trace.method ?? '',
        trace.url ?? '',
        trace.status,
        String(trace.statusCode ?? ''),
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    );
  }, [query, traces]);
  const selectedTrace =
    filteredTraces.find((trace) => trace.id === selectedTraceId) ?? filteredTraces[0] ?? null;

  useEffect(() => {
    if (selectedTraceId && filteredTraces.some((trace) => trace.id === selectedTraceId)) {
      return;
    }
    setSelectedTraceId(filteredTraces[0]?.id ?? null);
  }, [filteredTraces, selectedTraceId]);

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] overflow-hidden bg-[#f8faff]">
      <div className="border-b border-[#dfe5f5] bg-white/90 p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#7a849d]" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 rounded-lg border-[#dfe5f5] bg-white pl-8 text-xs"
            placeholder="Filter backend method, URL, status"
          />
        </div>
      </div>
      <div className="grid min-h-0 grid-cols-1 overflow-hidden md:grid-cols-[minmax(14rem,0.85fr)_minmax(0,1.15fr)]">
        <div className="thin-scrollbar min-h-0 overflow-auto border-r border-[#dfe5f5] bg-white">
          <PanelEmptyState
            isEmpty={filteredTraces.length === 0}
            label={traces.length === 0 ? 'No backend traces yet.' : 'No matching backend traces.'}
          />
          {filteredTraces.map((trace, index) => {
            const isSelected = selectedTrace?.id === trace.id;
            return (
              <button
                key={trace.id}
                type="button"
                onClick={() => setSelectedTraceId(trace.id)}
                className={`grid w-full grid-cols-[1.5rem_minmax(0,1fr)] gap-2 border-b border-[#edf1fb] px-3 py-2.5 text-left transition-colors ${
                  isSelected ? 'bg-[#eff6ff]' : 'hover:bg-[#f8faff]'
                }`}
              >
                <span className="pt-0.5 text-right font-mono text-[10px] text-[#9aa4ba]">{index + 1}</span>
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${backendStatusDotClass(trace)}`} />
                    <span className="truncate text-xs font-semibold text-[#16213a]">{trace.operationName}</span>
                  </span>
                  <span className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-[10px] text-[#64708a]">
                    <span className="shrink-0 rounded bg-[#eef3ff] px-1.5 py-0.5 text-[#25324d]">{trace.method ?? 'TRACE'}</span>
                    <span className={backendStatusTextClass(trace)}>{trace.statusCode ?? trace.status}</span>
                    <span className="truncate">{trace.url ? getDomain(trace.url) : trace.serviceName ?? 'backend'}</span>
                  </span>
                  <span className="mt-1 block text-[10px] text-[#7a849d]">
                    {formatDuration(trace.durationMs)} · {formatOffset(trace.offsetMs)} · {formatDate(trace.startedAt)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="thin-scrollbar min-h-0 overflow-auto bg-white">
          {selectedTrace ? (
            <div className="p-4">
              <div className="rounded-xl border border-[#dfe5f5] bg-[#fbfcff] p-4 shadow-[0_10px_28px_rgba(21,32,54,0.05)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={selectedTrace.status === 'ERROR' ? 'danger' : 'success'}>
                        {selectedTrace.status}
                      </Badge>
                      <span className="rounded-md bg-white px-2 py-1 font-mono text-xs text-[#25324d] ring-1 ring-[#dfe5f5]">
                        {selectedTrace.method ?? 'n/a'}
                      </span>
                      <span className="text-xs text-[#64708a]">{formatDuration(selectedTrace.durationMs)}</span>
                    </div>
                    <h3 className="mt-3 break-words text-sm font-semibold leading-5 text-[#16213a]">
                      {selectedTrace.operationName}
                    </h3>
                  </div>
                  <Server className="h-5 w-5 shrink-0 text-[#2563eb]" aria-hidden />
                </div>
                <div className="mt-3 rounded-lg border border-[#dfe5f5] bg-white px-3 py-2 font-mono text-[11px] leading-5 text-[#25324d]">
                  <span className="break-all">{selectedTrace.url ?? selectedTrace.serviceName ?? 'n/a'}</span>
                </div>
              </div>

              <div className="mt-3 overflow-hidden rounded-xl border border-[#dfe5f5] bg-white">
                <SectionTitle title="Trace" />
                <KeyValue label="HTTP status" value={selectedTrace.statusCode === null || selectedTrace.statusCode === undefined ? 'n/a' : String(selectedTrace.statusCode)} />
                <KeyValue label="Service" value={selectedTrace.serviceName ?? 'n/a'} />
                <KeyValue label="Trace ID" value={selectedTrace.traceId ?? 'n/a'} />
                <KeyValue label="Span ID" value={selectedTrace.spanId ?? 'n/a'} />
                <KeyValue label="Parent span" value={selectedTrace.parentSpanId ?? 'n/a'} />
                <KeyValue label="Started" value={formatDate(selectedTrace.startedAt)} />
                <KeyValue label="Ended" value={selectedTrace.endedAt ? formatDate(selectedTrace.endedAt) : 'n/a'} />
              </div>

              <div className="mt-3 overflow-hidden rounded-xl border border-[#dfe5f5] bg-white">
                <SectionTitle title="Metadata" />
                <div className="thin-scrollbar max-h-64 overflow-auto p-3 font-mono text-[11px]">
                  {selectedTrace.metadata ? <JsonTreeView value={selectedTrace.metadata} /> : <span className="text-[#7a849d]">n/a</span>}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-sm text-[#64708a]">Select a backend trace to inspect it.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelinePanel({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="thin-scrollbar h-full min-h-0 overflow-auto p-5">
      <PanelEmptyState isEmpty={entries.length === 0} label="No timeline entries yet." />
      <div className="space-y-3">
        {entries.map((entry) => (
          <div key={`${entry.type}-${entry.id}`} className="rounded-xl border border-[#dfe5f5] bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f4f7ff] text-[#2563eb]">
                  <TimelineIcon type={entry.type} />
                </span>
                <Badge tone={entry.severity as BadgeTone}>{entry.type}</Badge>
                <div className="min-w-0 truncate font-semibold text-[#16213a]">{entry.title}</div>
              </div>
              <div className="shrink-0 text-xs text-[#64708a]">
                {formatOffset(entry.offsetMs)} · {formatDate(entry.timestamp)}
              </div>
            </div>
            {entry.subtitle ? (
              <div className="mt-2 break-all font-mono text-xs leading-5 text-[#4b5875]">
                {entry.subtitle}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineIcon({ type }: { type: string }) {
  if (type === 'NETWORK') {
    return <Wifi className="h-4 w-4" aria-hidden />;
  }

  if (type === 'CONSOLE') {
    return <Terminal className="h-4 w-4" aria-hidden />;
  }

  if (type === 'ERROR') {
    return <AlertTriangle className="h-4 w-4" aria-hidden />;
  }

  if (type === 'ACTION') {
    return <MousePointer2 className="h-4 w-4" aria-hidden />;
  }

  if (type === 'BACKEND') {
    return <Server className="h-4 w-4" aria-hidden />;
  }

  return <Clock className="h-4 w-4" aria-hidden />;
}

function TelemetryCard({
  title,
  subtitle,
  tone,
  timestamp,
  offsetMs,
  rows,
}: {
  title: string;
  subtitle?: string | null;
  tone: BadgeTone;
  timestamp: string;
  offsetMs?: number | null;
  rows: Array<[string, string]>;
}) {
  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-[#e2e0dc] bg-white">
      <div className="border-b border-[#efeeeb] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Badge tone={tone}>{title}</Badge>
            {subtitle ? (
              <div className="min-w-0 truncate text-sm font-semibold text-[#242321]">
                {subtitle}
              </div>
            ) : null}
          </div>
          <div className="shrink-0 text-xs text-[#77736d]">
            {formatOffset(offsetMs)} · {formatDate(timestamp)}
          </div>
        </div>
      </div>
      <div>
        {rows.map(([label, value]) => (
          <KeyValue key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  );
}

function PanelEmptyState({ isEmpty, label }: { isEmpty: boolean; label: string }) {
  if (!isEmpty) {
    return null;
  }

  return (
    <div className="rounded-xl border border-dashed border-[#d8d5cf] bg-white p-6 text-sm text-[#77736d]">
      {label}
    </div>
  );
}

type ConsoleLevelFilter = 'All levels' | 'Errors' | 'Warnings' | 'Info';

interface ConsoleRow {
  id: string;
  kind: 'console' | 'runtime-error';
  title: string;
  message: string;
  timestamp: string;
  offsetMs?: number | null;
  url?: string | null;
  tone: 'neutral' | 'danger' | 'info' | 'warning';
}

function ConsoleActivityPanel({ report }: { report: ReportDetail }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState<ConsoleLevelFilter>('All levels');
  const rows = useMemo(() => buildConsoleRows(report), [report]);
  const filteredRows = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesLevel =
        levelFilter === 'All levels' ||
        (levelFilter === 'Errors' && row.tone === 'danger') ||
        (levelFilter === 'Warnings' && row.tone === 'warning') ||
        (levelFilter === 'Info' && (row.tone === 'info' || row.tone === 'neutral'));
      const matchesSearch =
        normalizedQuery.length === 0 ||
        [row.title, row.message, row.url ?? ''].join(' ').toLowerCase().includes(normalizedQuery);

      return matchesLevel && matchesSearch;
    });
  }, [levelFilter, rows, searchTerm]);

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] overflow-hidden bg-white">
      <div className="border-b border-[#dfe5f5] bg-[#f4f7ff]">
        <div className="grid gap-2 p-2.5 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#7a849d]" aria-hidden />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="h-8 rounded-lg border-[#dfe5f5] bg-white pl-8 text-xs"
              placeholder="Filter console message, URL"
            />
          </div>
          <select
            value={levelFilter}
            onChange={(event) => setLevelFilter(event.target.value as ConsoleLevelFilter)}
            className="h-8 rounded-lg border border-[#dfe5f5] bg-white px-2.5 text-xs text-[#4b5875]"
          >
            {(['All levels', 'Errors', 'Warnings', 'Info'] as const).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="thin-scrollbar min-h-0 overflow-auto bg-white">
        <PanelEmptyState
          isEmpty={filteredRows.length === 0}
          label={rows.length === 0 ? 'No console logs yet.' : 'No matching console logs.'}
        />
        {filteredRows.map((row) => (
          <div
            key={row.id}
            className={`grid grid-cols-[3rem_1.25rem_1fr] gap-2 border-b px-2.5 py-2 font-mono text-[11px] ${consoleRowClass(row.tone)}`}
          >
            <div className="text-right text-[#7a849d]">{formatOffset(row.offsetMs)}</div>
            <div className="pt-0.5">
              <ConsoleRowIcon row={row} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">{row.title}</span>
                {row.url ? <span className="break-all text-[#64708a]">{row.url}</span> : null}
              </div>
              {row.message ? (
                <div className="mt-1 break-all leading-5 text-[#4b5875]">{row.message}</div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildConsoleRows(report: ReportDetail): ConsoleRow[] {
  return [
    ...report.runtimeErrors.map((entry): ConsoleRow => ({
      id: `runtime-${entry.id}`,
      kind: 'runtime-error',
      title: entry.kind,
      message: entry.message,
      timestamp: entry.occurredAt,
      offsetMs: entry.offsetMs,
      url: entry.sourceUrl ?? entry.pageUrl,
      tone: 'danger',
    })),
    ...report.consoleLogs.map((entry): ConsoleRow => ({
      id: `console-${entry.id}`,
      kind: 'console',
      title: entry.level,
      message: entry.message,
      timestamp: entry.timestamp,
      offsetMs: entry.offsetMs,
      url: entry.pageUrl,
      tone: entry.level === 'ERROR' ? 'danger' : entry.level === 'WARN' ? 'warning' : 'neutral',
    })),
  ].sort((first, second) => {
    const firstOffset = first.offsetMs ?? new Date(first.timestamp).getTime();
    const secondOffset = second.offsetMs ?? new Date(second.timestamp).getTime();
    return firstOffset - secondOffset;
  });
}

function ConsoleRowIcon({ row }: { row: ConsoleRow }) {
  const className = 'h-4 w-4';

  if (row.kind === 'runtime-error') {
    return <AlertTriangle className={`${className} text-[#e11d48]`} aria-hidden />;
  }

  return <Terminal className={`${className} text-[#64708a]`} aria-hidden />;
}

function consoleRowClass(tone: ConsoleRow['tone']) {
  if (tone === 'danger') {
    return 'border-[#fecdd3] bg-[#fff1f2] text-[#be123c]';
  }

  if (tone === 'warning') {
    return 'border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]';
  }

  if (tone === 'info') {
    return 'border-[#dbeafe] bg-[#eff6ff] text-[#1d4ed8]';
  }

  return 'border-[#edf1fb] bg-white text-[#25324d]';
}

function backendStatusDotClass(trace: BackendTraceEntry) {
  if (trace.status === 'ERROR' || (trace.statusCode ?? 0) >= 500) {
    return 'bg-[#e11d48]';
  }

  if ((trace.statusCode ?? 0) >= 400) {
    return 'bg-[#f97316]';
  }

  if (trace.status === 'OK' || (trace.statusCode !== null && trace.statusCode !== undefined && trace.statusCode < 400)) {
    return 'bg-[#10b981]';
  }

  return 'bg-[#94a3b8]';
}

function backendStatusTextClass(trace: BackendTraceEntry) {
  if (trace.status === 'ERROR' || (trace.statusCode ?? 0) >= 500) {
    return 'shrink-0 font-semibold text-[#be123c]';
  }

  if ((trace.statusCode ?? 0) >= 400) {
    return 'shrink-0 font-semibold text-[#c2410c]';
  }

  return 'shrink-0 font-semibold text-[#047857]';
}

function NetworkPanel({ report }: { report: ReportDetail }) {
  const [activeFilter, setActiveFilter] = useState<NetworkFilter>('All');
  const [activeDetailTab, setActiveDetailTab] = useState<NetworkDetailTab>('Headers');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    report.networkRequests[0]?.id ?? null,
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedbackTarget>(null);
  const [requestListWidth, setRequestListWidth] = useState(224);
  const [bodyViewMode, setBodyViewMode] = useState<BodyViewMode>('tree');

  const filteredRequests = useMemo(
    () =>
      report.networkRequests.filter((request) => {
        const category = classifyNetworkRequest(request);
        const matchesCategory = activeFilter === 'All' || category === activeFilter;
        const normalizedQuery = searchTerm.trim().toLowerCase();
        const matchesSearch =
          normalizedQuery.length === 0 ||
          [
            request.method,
            request.url,
            shortRequestName(request.url),
            isNextRscRequest(request) ? 'next rsc flight react server components' : '',
            String(request.statusCode ?? ''),
            request.error ?? '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery);
        const matchesError = !errorsOnly || Boolean(request.error || (request.statusCode ?? 0) >= 400);

        return matchesCategory && matchesSearch && matchesError;
      }),
    [activeFilter, errorsOnly, report.networkRequests, searchTerm],
  );
  const selected =
    filteredRequests.find((request) => request.id === selectedRequestId) ?? filteredRequests[0] ?? null;

  async function handleCopyCurl() {
    if (!selected) {
      return;
    }

    await writeClipboard(buildCurlCommand(selected));
    setCopyFeedback('curl');
    window.setTimeout(() => setCopyFeedback(null), 1_400);
  }

  async function handleCopyResponseBody() {
    if (!selected?.responseBody) {
      return;
    }

    await writeClipboard(selected.responseBody);
    setCopyFeedback('response');
    window.setTimeout(() => setCopyFeedback(null), 1_400);
  }

  function handleRequestListResize(event: ReactPointerEvent<HTMLDivElement>) {
    const startWidth = requestListWidth;
    startHorizontalResize(event, (deltaX) => {
      setRequestListWidth(clamp(startWidth + deltaX, MIN_NETWORK_LIST_WIDTH, MAX_NETWORK_LIST_WIDTH));
    });
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] overflow-hidden">
      <div className="border-b border-[#dfe5f5] bg-[#f4f7ff] p-2.5">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#7a849d]" aria-hidden />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="h-8 rounded-lg border-[#dfe5f5] bg-white pl-8 text-xs"
              placeholder="Filter method, URL, status, domain"
            />
          </div>
          <label className="flex h-8 items-center gap-1.5 rounded-lg border border-[#d8d5cf] bg-white px-2.5 text-[11px] text-[#5f5a55]">
            <input
              type="checkbox"
              checked={errorsOnly}
              onChange={(event) => setErrorsOnly(event.target.checked)}
              className="h-3.5 w-3.5 accent-[#0f766e]"
            />
            Errors only
          </label>
        </div>
        <div className="scrollbar-none mt-2 flex gap-1 overflow-x-auto pb-0.5 text-[11px]">
          {networkFilterLabels.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setActiveFilter(item);
                setSelectedRequestId(null);
              }}
              className={`flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 ${
                item === activeFilter
                  ? 'border-[#bfdbfe] bg-[#dbeafe] text-[#1d4ed8]'
                  : 'border-[#dfe5f5] bg-white text-[#64708a] hover:bg-[#f8faff]'
              }`}
            >
              <NetworkTypeIcon category={item} className="h-3 w-3" />
              {item}
            </button>
          ))}
        </div>
      </div>
      <div
        className="grid min-h-0 grid-cols-1 overflow-hidden sm:[grid-template-columns:var(--network-list-width)_6px_minmax(0,1fr)]"
        style={{ '--network-list-width': `${requestListWidth}px` } as CSSProperties}
      >
        <div className="thin-scrollbar min-h-0 overflow-auto border-r border-[#dfe5f5] bg-white">
          <PanelEmptyState
            isEmpty={filteredRequests.length === 0}
            label={report.networkRequests.length === 0 ? 'No network requests yet.' : 'No matching requests.'}
          />
          {filteredRequests.map((request, index) => (
            <button
              key={request.id}
              type="button"
              onClick={() => setSelectedRequestId(request.id)}
              className={`grid w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-1.5 border-b border-[#edf1fb] px-2 py-1.5 text-left text-[11px] transition-colors ${
                selected?.id === request.id ? 'bg-[#eff6ff] text-[#1d4ed8]' : 'text-[#4b5875] hover:bg-[#f8faff]'
              }`}
            >
              <span className="pt-0.5 text-right font-mono text-[10px] text-[#9aa4ba]">{index + 1}</span>
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-1">
                  <NetworkRequestIcon request={request} />
                  <span className="truncate text-[12px] font-semibold leading-4 text-[#16213a]">{shortRequestName(request.url)}</span>
                </span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden font-mono text-[10px] leading-3">
                  <span className="shrink-0 text-[#4b5875]">{request.method}</span>
                  <span className={`shrink-0 font-semibold ${networkStatusTextClass(request.statusCode, request.error)}`}>
                    {request.statusCode ?? 'ERR'}
                  </span>
                  <span className="truncate text-[#7a849d]">{getDomain(request.url)}</span>
                </span>
              </span>
              <span className="pt-0.5 text-right font-mono text-[10px] text-[#7a849d]">
                {request.durationMs ?? 0}ms
              </span>
            </button>
          ))}
        </div>
        <ResizeGrip
          label="Resize request list"
          className="hidden h-full cursor-col-resize border-r border-[#dfe5f5] bg-[#f8faff] hover:bg-[#eaf1ff] sm:block"
          onPointerDown={handleRequestListResize}
        />
        <div className="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden bg-white">
          <div className="scrollbar-none flex h-8 items-center gap-2 overflow-x-auto border-b border-[#dfe5f5] bg-white px-2">
            <button
              type="button"
              onClick={() => {
                setActiveFilter('All');
                setSearchTerm('');
                setErrorsOnly(false);
                setSelectedRequestId(report.networkRequests[0]?.id ?? null);
                setActiveDetailTab('Headers');
              }}
              aria-label="Reset network filters"
              className="grid h-7 w-7 place-items-center rounded-md text-[#64708a] hover:bg-[#f2f5ff]"
            >
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
            </button>
            {networkDetailTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveDetailTab(tab)}
                className={`shrink-0 rounded-md px-2 py-1 text-xs ${
                  activeDetailTab === tab ? 'bg-[#fff1e7] font-semibold text-[#c2410c]' : 'text-[#64708a] hover:bg-[#f8faff]'
                }`}
              >
                {tab}
              </button>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="ml-auto h-7 shrink-0 rounded-lg px-2 text-xs"
              title={bodyViewMode === 'tree' ? 'Show raw body' : 'Show parsed tree'}
              onClick={() => setBodyViewMode((mode) => (mode === 'tree' ? 'raw' : 'tree'))}
            >
              {bodyViewMode === 'tree' ? <FileCode2 className="h-3.5 w-3.5" aria-hidden /> : <ListTree className="h-3.5 w-3.5" aria-hidden />}
              {bodyViewMode === 'tree' ? 'Raw' : 'Tree'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 shrink-0 rounded-lg px-2 text-xs"
              disabled={!selected?.responseBody}
              title="Copy response body as captured"
              onClick={() => void handleCopyResponseBody()}
            >
              {copyFeedback === 'response' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copyFeedback === 'response' ? 'Copied' : 'Body'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 shrink-0 rounded-lg px-2 text-xs"
              disabled={!selected}
              onClick={() => void handleCopyCurl()}
              title="Copy request as cURL"
            >
              {copyFeedback === 'curl' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copyFeedback === 'curl' ? 'Copied' : 'cURL'}
            </Button>
          </div>
          <div className="thin-scrollbar min-h-0 overflow-auto">
            {selected ? (
              <NetworkRequestDetails request={selected} activeTab={activeDetailTab} bodyViewMode={bodyViewMode} />
            ) : (
              <div className="p-6 text-[#77736d]">Select a request to inspect its payload.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NetworkRequestDetails({
  request,
  activeTab,
  bodyViewMode,
}: {
  request: NetworkRequestEntry;
  activeTab: NetworkDetailTab;
  bodyViewMode: BodyViewMode;
}) {
  if (activeTab === 'Request') {
    return (
      <div>
        <SectionTitle title="Request" />
        <KeyValue label="Request URL" value={request.url} />
        <KeyValue label="Request Method" value={request.method} />
        <SectionTitle title="Request Headers" />
        <KeyValueList entries={jsonRecordEntries(request.requestHeaders)} emptyLabel="headers" />
        <BodyPreview title="Request Body" value={request.requestBody} headers={request.requestHeaders} viewMode={bodyViewMode} />
      </div>
    );
  }

  if (activeTab === 'Response') {
    return (
      <div>
        <SectionTitle title="Response" />
        <KeyValue label="Status Code" value={String(request.statusCode ?? 'n/a')} />
        <KeyValue label="Duration" value={request.durationMs === null || request.durationMs === undefined ? 'n/a' : `${request.durationMs} ms`} />
        <KeyValue label="Error" value={request.error ?? 'n/a'} />
        <SectionTitle title="Response Headers" />
        <KeyValueList entries={jsonRecordEntries(request.responseHeaders)} emptyLabel="headers" />
        <BodyPreview title="Response Body" value={request.responseBody} headers={request.responseHeaders} viewMode={bodyViewMode} />
      </div>
    );
  }

  return (
    <div>
      <SectionTitle title="General" />
      <KeyValue label="Request URL" value={request.url} />
      <KeyValue label="Request Method" value={request.method} />
      <KeyValue label="Status Code" value={String(request.statusCode ?? 'n/a')} />
      <KeyValue label="Type" value={isNextRscRequest(request) ? 'Next.js RSC / Flight' : classifyNetworkRequest(request)} />
      <KeyValue label="Offset" value={formatOffset(request.offsetMs)} />
      <SectionTitle title="Response Headers" />
      <KeyValueList entries={jsonRecordEntries(request.responseHeaders)} emptyLabel="headers" />
      <SectionTitle title="Request Headers" />
      <KeyValueList entries={jsonRecordEntries(request.requestHeaders)} emptyLabel="headers" />
    </div>
  );
}

function NetworkRequestIcon({ request }: { request: NetworkRequestEntry }) {
  if (isNextRscRequest(request)) {
    return (
      <span
        title="Next.js RSC / Flight"
        className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded bg-[#111827] text-[8px] font-bold leading-none text-white"
      >
        N
      </span>
    );
  }

  return <NetworkTypeIcon category={classifyNetworkRequest(request)} className="h-3 w-3 shrink-0" />;
}

function NetworkTypeIcon({ category, className }: { category: NetworkFilter; className?: string }) {
  const Icon =
    category === 'WS'
      ? Wifi
      : category === 'JS'
        ? FileCode2
        : category === 'CSS'
          ? FileText
          : category === 'Media'
            ? Activity
            : category === 'Font'
              ? FileText
              : category === 'Doc'
                ? FileText
                : category === 'Other'
                  ? Globe
                  : Zap;

  return <Icon className={className} aria-hidden />;
}

function networkStatusTextClass(statusCode: number | null | undefined, error?: string | null) {
  if (error || (statusCode ?? 0) >= 400) {
    return 'text-[#be123c]';
  }

  if ((statusCode ?? 0) >= 300) {
    return 'text-[#c2410c]';
  }

  return 'text-[#15803d]';
}

function KeyValueList({
  entries,
  emptyLabel,
}: {
  entries: Array<[string, string]>;
  emptyLabel: string;
}) {
  if (entries.length === 0) {
    return <KeyValue label={emptyLabel} value="n/a" />;
  }

  return entries.map(([label, value]) => <KeyValue key={label} label={label} value={value} />);
}

function SectionTitle({ title }: { title: string }) {
  return <div className="border-y border-[#dfe5f5] bg-[#f4f7ff] px-3 py-1.5 text-xs font-semibold text-[#25324d]">{title}</div>;
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 border-b border-[#edf1fb] text-xs sm:grid-cols-[7.5rem_1fr]">
      <div className="px-3 py-1.5 text-[#64708a]">{label}</div>
      <div className="break-all px-3 pb-1.5 font-mono text-[11px] text-[#16213a] sm:py-1.5">{value}</div>
    </div>
  );
}

function formatBodyPreview(value: string, headers?: unknown): BodyPreviewResult {
  const contentType = getHeaderValue(headers, 'content-type')?.toLowerCase() ?? '';
  const trimmed = value.trim();

  if (isJsonPayload(trimmed, contentType)) {
    try {
      const parsedJson = JSON.parse(trimmed) as unknown;
      return {
        body: JSON.stringify(parsedJson, null, 2),
        label: 'JSON',
        note: null,
        parsedJson,
      };
    } catch {
      return {
        body: value,
        label: contentType.includes('json') ? 'Invalid JSON' : 'Text',
        note: contentType.includes('json') ? 'Content-Type says JSON, but the body could not be parsed.' : null,
      };
    }
  }

  if (isNextFlightPayload(trimmed, contentType)) {
    return {
      body: value,
      label: 'Next.js RSC / Flight stream',
      note:
        'This is a Next.js React Server Components payload transported over fetch/XHR. It is expected to look like a text stream, not regular JSON.',
    };
  }

  return {
    body: value,
    label: contentType || 'Text',
    note: null,
  };
}

function isJsonPayload(value: string, contentType: string) {
  if (contentType.includes('json')) {
    return true;
  }

  return (
    (value.startsWith('{') && value.endsWith('}')) ||
    (value.startsWith('[') && value.endsWith(']'))
  );
}

function isNextFlightPayload(value: string, contentType: string) {
  return (
    contentType.includes('text/x-component') ||
    value.includes('$Sreact.') ||
    /^\d+:[A-Z]?\[/.test(value) ||
    /^\d+:\{/.test(value)
  );
}

function isNextRscRequest(request: NetworkRequestEntry) {
  const responseContentType = getHeaderValue(request.responseHeaders, 'content-type')?.toLowerCase() ?? '';
  const requestHeaders = request.requestHeaders;
  const requestUrl = request.url.toLowerCase();

  return (
    requestUrl.includes('_rsc=') ||
    Boolean(getHeaderValue(requestHeaders, 'rsc')) ||
    isNextFlightPayload(request.responseBody ?? '', responseContentType)
  );
}

function formatByteCount(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function shortRequestName(url: string) {
  try {
    const parsedUrl = new URL(url);
    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    return segments.at(-1) ?? parsedUrl.hostname;
  } catch {
    return url;
  }
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'local';
  }
}

function classifyNetworkRequest(request: NetworkRequestEntry): NetworkFilter {
  const url = request.url.toLowerCase();
  const responseContentType = getHeaderValue(request.responseHeaders, 'content-type')?.toLowerCase() ?? '';
  const requestContentType = getHeaderValue(request.requestHeaders, 'content-type')?.toLowerCase() ?? '';
  const contentType = `${responseContentType} ${requestContentType}`;

  if (url.startsWith('ws:') || url.startsWith('wss:')) {
    return 'WS';
  }

  if (url.endsWith('.js') || contentType.includes('javascript')) {
    return 'JS';
  }

  if (url.endsWith('.css') || contentType.includes('text/css')) {
    return 'CSS';
  }

  if (contentType.includes('image/') || contentType.includes('video/') || contentType.includes('audio/')) {
    return 'Media';
  }

  if (contentType.includes('font') || /\.(woff2?|ttf|otf)(\?|$)/.test(url)) {
    return 'Font';
  }

  if (contentType.includes('text/html') || contentType.includes('document')) {
    return 'Doc';
  }

  if (request.requestId || contentType.includes('json') || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    return 'Fetch/XHR';
  }

  return 'Other';
}

function getHeaderValue(headers: unknown, headerName: string) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    return null;
  }

  const normalizedHeaderName = headerName.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === normalizedHeaderName);
  const value = entry?.[1];

  return typeof value === 'string' ? value : null;
}

function buildCurlCommand(request: NetworkRequestEntry) {
  const parts = ['curl', quoteShellValue(request.url), '-X', quoteShellValue(request.method)];

  jsonRecordEntries(request.requestHeaders).forEach(([key, value]) => {
    parts.push('-H', quoteShellValue(`${key}: ${value}`));
  });

  if (request.requestBody) {
    parts.push('--data-raw', quoteShellValue(request.requestBody));
  }

  return parts.join(' ');
}

function quoteShellValue(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function writeClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through to the textarea strategy for restricted browser contexts.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function ResizeGrip({
  label,
  className,
  onPointerDown,
}: {
  label: string;
  className: string;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="separator"
      aria-label={label}
      tabIndex={0}
      className={className}
      onPointerDown={onPointerDown}
    />
  );
}

function startHorizontalResize(
  event: ReactPointerEvent<Element>,
  onMove: (deltaX: number) => void,
) {
  event.preventDefault();
  const startX = event.clientX;
  const originalCursor = document.body.style.cursor;
  const originalUserSelect = document.body.style.userSelect;

  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  function handlePointerMove(moveEvent: PointerEvent) {
    onMove(moveEvent.clientX - startX);
  }

  function handlePointerUp() {
    document.body.style.cursor = originalCursor;
    document.body.style.userSelect = originalUserSelect;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp, { once: true });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatOffset(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'no offset';
  }

  const seconds = value / 1000;
  return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
}

function formatDuration(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'n/a';
  }

  return formatOffset(value);
}

function stringify(value: unknown) {
  if (value === null || value === undefined) {
    return 'n/a';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
