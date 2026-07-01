'use client';

import { type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Apple,
  AppWindow,
  ArrowLeft,
  Check,
  Clock,
  Copy,
  FileCode2,
  FileText,
  Globe,
  Info,
  Keyboard,
  Link2,
  ListTree,
  Loader2,
  Monitor,
  MousePointerClick,
  MousePointer2,
  MoveVertical,
  Navigation,
  Play,
  RefreshCcw,
  Search,
  Send,
  Server,
  Smartphone,
  Terminal,
  TextCursorInput,
  UserRound,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Textarea } from '@/components/ui/input';
import { Input } from '@/components/ui/input';
import type {
  BackendTraceEntry,
  NetworkRequestEntry,
  PageActionEntry,
  ReportDetail,
  TimelineEntry,
} from '@/lib/api/types';
import { apiClient } from '@/lib/api/client';
import { formatBytes, formatDate } from '@/lib/utils';
import { reportKeys } from '../queries';
import { StatusBadge } from './status-badge';

interface CaptureDetailViewProps {
  report: ReportDetail | undefined;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
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

// Visible tabs only — other telemetry (Timeline, Performance, DOM, Backend)
// is still captured and stored, but not surfaced in the UI for now.
const devToolsTabItems = [
  { id: 'Info', icon: Info },
  { id: 'Console', icon: Terminal },
  { id: 'Network', icon: Wifi },
  { id: 'Actions', icon: MousePointer2 },
  { id: 'Errors', icon: AlertTriangle },
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
  isError,
  onRetry,
  onBack,
}: CaptureDetailViewProps) {
  const [activeTab, setActiveTab] = useState<DevToolsTab>('Info');
  const [commentBody, setCommentBody] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(true);
  const [devToolsWidth, setDevToolsWidth] = useState(640);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedbackTarget>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [videoDurationMs, setVideoDurationMs] = useState(0);
  const [seekTargetMs, setSeekTargetMs] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const comments = report?.comments ?? [];

  const seekTo = (ms: number) => setSeekTargetMs(ms);
  const handleSeekComplete = () => setSeekTargetMs(null);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onBack();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onBack]);

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

    const url = new URL(`/c/${report.id}`, window.location.origin);
    await writeClipboard(url.toString());
    setCopyFeedback('link');
    window.setTimeout(() => setCopyFeedback(null), 1_400);
  }

  async function handleCopyMarkdown() {
    if (!report) {
      return;
    }

    const shareUrl = new URL(`/c/${report.id}`, window.location.origin);

    const counts = [
      report.consoleLogs.length > 0 ? `${report.consoleLogs.length} console` : null,
      report.networkRequests.length > 0 ? `${report.networkRequests.length} network` : null,
      report.pageActions.length > 0 ? `${report.pageActions.length} actions` : null,
      report.runtimeErrors.length > 0 ? `**${report.runtimeErrors.length} errors**` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    const firstError = report.runtimeErrors[0];

    const markdown = [
      `### 🐛 ${report.title}`,
      '',
      report.description ? `${report.description}` : '_No description._',
      '',
      `- **URL:** ${report.pageUrl ?? '—'}`,
      `- **Status:** \`${report.status}\``,
      `- **Browser:** ${[report.browserName, report.browserVersion].filter(Boolean).join(' ') || '—'}`,
      counts ? `- **Telemetry:** ${counts}` : null,
      firstError ? `- **First error:** \`${firstError.message}\`` : null,
      '',
      `[Open in Weevil →](${shareUrl.toString()})`,
    ]
      .filter((line) => line !== null)
      .join('\n');

    await writeClipboard(markdown);
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

  // Error before loading, so a failed detail fetch shows a retry — not a
  // skeleton that spins forever (report stays undefined on error).
  if (isError && !report) {
    return (
      <section className="flex min-h-[calc(100dvh-3.5rem)] flex-col bg-[var(--bg)]">
        <div className="flex h-14 items-center gap-2 border-b border-[var(--border)] px-3 sm:px-4 lg:px-6">
          <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label="Back">
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Button>
          <span className="text-sm font-semibold text-[var(--ink)]">Capture</span>
        </div>
        <div className="grid flex-1 place-items-center p-6">
          <div className="w-full max-w-md">
            <ErrorState
              title="Couldn’t load this capture"
              description="It may have been deleted, or the workspace is unreachable. Try again."
              onRetry={onRetry}
            />
          </div>
        </div>
      </section>
    );
  }

  if (isLoading || !report) {
    return (
      <section className="min-h-[calc(100dvh-3.5rem)] bg-[var(--bg)] p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 animate-pulse rounded-md bg-[var(--surface-deep)]" />
          <div className="h-5 w-48 animate-pulse rounded bg-[var(--surface-deep)]" />
        </div>
        <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_34rem]">
          <div className="aspect-video animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]" />
          <div className="h-64 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]" />
        </div>
      </section>
    );
  }

  return (
    <section
      data-shell-mode="detail"
      className={`weevil-fade-in grid h-[calc(100vh-3.5rem)] max-h-[calc(100vh-3.5rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[var(--bg)] transition-[grid-template-columns] duration-200 ease-out ${
        isDevToolsOpen ? 'xl:[grid-template-columns:minmax(0,1fr)_var(--devtools-width)]' : ''
      }`}
      style={{ '--devtools-width': `${devToolsWidth}px` } as CSSProperties}
    >
      <header
        className={`flex min-h-14 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg)]/95 px-3 backdrop-blur sm:gap-3 sm:px-4 lg:px-6 ${
          isDevToolsOpen ? 'xl:col-span-2' : ''
        }`}
      >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label="Back to inbox"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <StatusBadge status={report.status} />
              <span className="truncate text-sm font-semibold text-[var(--ink)]">{report.title}</span>
            </div>
            <div className="hidden items-center gap-3 font-mono text-[11px] text-[var(--ink-faint)] sm:flex">
              <span className="truncate">{report.pageUrl ?? report.id}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {!isDevToolsOpen ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsDevToolsOpen(true)}
                className="hidden sm:inline-flex"
              >
                DevTools
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              title="Copy as Markdown — paste into Linear, Slack, Jira, etc."
              onClick={() => void handleCopyMarkdown()}
              aria-label="Copy as Markdown"
            >
              {copyFeedback === 'send' ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <FileText className="h-3.5 w-3.5" aria-hidden />
              )}
              <span className="hidden md:inline">{copyFeedback === 'send' ? 'Copied' : 'Copy as Markdown'}</span>
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void handleCopyLink()}
              aria-label="Copy link"
            >
              {copyFeedback === 'link' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}
              <span className="hidden sm:inline">{copyFeedback === 'link' ? 'Link copied' : 'Copy link'}</span>
            </Button>
          </div>
      </header>

      <div className="grid min-h-0 grid-rows-[1fr_auto] overflow-hidden bg-[var(--bg)]">
        <div className="thin-scrollbar min-h-0 overflow-auto">
          <div className={isDevToolsOpen ? '' : 'mx-auto max-w-[108rem]'}>
            <div className="border-b border-[var(--border)] bg-[var(--bg)] px-4 pb-4 pt-4 lg:px-6">
              <div className="mx-auto w-full max-w-[88rem]">
                <RecordingHero
                  report={report}
                  seekTargetMs={seekTargetMs}
                  onSeekComplete={handleSeekComplete}
                  onTimeUpdate={setCurrentTimeMs}
                  onDurationLoad={setVideoDurationMs}
                />
                {videoDurationMs > 0 ? (
                  <TimelineScrubber
                    currentMs={currentTimeMs}
                    durationMs={videoDurationMs}
                    entries={report.timeline ?? []}
                    onSeek={seekTo}
                  />
                ) : null}
              </div>
            </div>

            <div className="mx-auto w-full max-w-[82rem] px-4 py-8 lg:px-6">
              <CaptureStats report={report} />
              <CaptureContextBar report={report} />

              <div className="mt-8">
                <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--ink)]">
                  {report.title}
                </h1>
                {report.description ? (
                  <p className="mt-3 text-base leading-7 text-[var(--ink-muted)]">{report.description}</p>
                ) : (
                  <p className="mt-3 text-base italic leading-7 text-[var(--ink-faint)]">
                    No description yet. Drop a few lines to give engineers a head start.
                  </p>
                )}
                <div className="mt-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">
                  <span>captured</span>
                  <span>·</span>
                  <span className="normal-case tracking-normal text-[var(--ink-muted)]">{formatDate(report.createdAt)}</span>
                </div>
              </div>

              <section className="mt-12 border-t border-[var(--border)] pb-16 pt-8">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
                    Discussion
                  </h2>
                  <span className="font-mono text-[11px] text-[var(--ink-faint)]">
                    {comments.length} {comments.length === 1 ? 'reply' : 'replies'}
                  </span>
                </div>
                <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 transition-colors focus-within:border-[var(--primary)]">
                  <div className="flex gap-3">
                    <CommentAvatar name="You" />
                    <Textarea
                      value={commentBody}
                      onChange={(event) => setCommentBody(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          (event.metaKey || event.ctrlKey) &&
                          event.key === 'Enter' &&
                          commentBody.trim() &&
                          !isPostingComment
                        ) {
                          event.preventDefault();
                          void handleCreateComment();
                        }
                      }}
                      className="min-h-24 border-0 p-0 text-sm shadow-none focus:ring-0"
                      placeholder="Write a comment, paste a fix, or @mention…"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[var(--ink-faint)]">
                    <span className="font-mono text-[10px] uppercase tracking-wider">cmd + enter</span>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isPostingComment || !commentBody.trim()}
                      onClick={() => void handleCreateComment()}
                    >
                      {isPostingComment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Post
                    </Button>
                  </div>
                </div>
                {comments.length > 0 ? (
                  <ol className="mt-6 space-y-5 border-l border-[var(--border)] pl-5">
                    {comments.map((comment) => (
                      <li key={comment.id} className="relative">
                        <span className="absolute -left-[29px] top-1.5" aria-hidden>
                          <CommentAvatar name={comment.authorName} size="sm" />
                        </span>
                        <div className="flex flex-wrap items-baseline justify-between gap-3">
                          <span className="text-sm font-semibold text-[var(--ink)]">
                            {comment.authorName}
                          </span>
                          <time className="font-mono text-[11px] text-[var(--ink-faint)]">{formatDate(comment.createdAt)}</time>
                        </div>
                        <div className="mt-1 max-w-[72ch] text-sm leading-6 text-[var(--ink-muted)]">
                          {comment.body}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </section>
            </div>
          </div>
        </div>

        {isDevToolsOpen ? (
        <div className="border-t border-[var(--border)] bg-[var(--surface)] xl:hidden">
          <DevToolsShell
            report={report}
            activeTab={activeTab}
            onActiveTabChange={setActiveTab}
            onClose={() => setIsDevToolsOpen(false)}
            isCompact
            currentTimeMs={currentTimeMs}
            seekTo={seekTo}
          />
        </div>
        ) : null}
      </div>

      {isDevToolsOpen ? (
      <aside className="relative hidden h-full min-h-0 min-w-0 overflow-hidden border-l border-[var(--border)] bg-[var(--surface)] xl:grid xl:grid-rows-[1fr]">
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
          currentTimeMs={currentTimeMs}
          seekTo={seekTo}
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
  currentTimeMs,
  seekTo,
}: {
  report: ReportDetail;
  activeTab: DevToolsTab;
  onActiveTabChange: (tab: DevToolsTab) => void;
  onClose: () => void;
  isCompact?: boolean;
  currentTimeMs: number;
  seekTo: (ms: number) => void;
}) {
  const counts: Partial<Record<DevToolsTab, number>> = {
    Console: report.consoleLogs.length,
    Network: report.networkRequests.length,
    Actions: report.pageActions.length,
    Errors: report.runtimeErrors.length,
    Backend: report.backendTraces.length,
    Performance: report.performanceEntries.length,
    DOM: report.domEvents.length,
    Timeline: report.timeline?.length ?? 0,
  };

  return (
    <div className={isCompact ? 'grid h-[min(36rem,76vh)] min-h-0 min-w-0 grid-rows-[auto_1fr] bg-[var(--bg)]' : 'grid h-full min-h-0 min-w-0 grid-rows-[auto_1fr] bg-[var(--bg)]'}>
      <div className="flex h-11 items-stretch border-b border-[var(--border)] bg-[var(--surface)] pl-3 pr-1">
        <div className="hidden items-center gap-1.5 pr-3 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)] sm:flex">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--primary)]" />
          devtools
        </div>
        <div className="my-2 hidden w-px shrink-0 bg-[var(--border)] sm:block" />
        <div className="scrollbar-none flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto pl-1.5">
          {devToolsTabItems.map(({ id: tab, icon: Icon }) => {
            const isActive = activeTab === tab;
            const count = counts[tab];
            return (
              <button
                key={tab}
                type="button"
                onClick={() => onActiveTabChange(tab)}
                className={`relative flex shrink-0 items-center gap-1.5 px-3 text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'text-[var(--ink)]'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                }`}
              >
                <Icon className="h-3 w-3" aria-hidden />
                {tab}
                {typeof count === 'number' && count > 0 ? (
                  <span
                    className={`min-w-4 rounded px-1 text-center font-mono text-[10px] ${
                      isActive
                        ? 'bg-[var(--primary-subtle)] text-[var(--primary)]'
                        : 'text-[var(--ink-faint)]'
                    }`}
                  >
                    {count}
                  </span>
                ) : null}
                {isActive ? (
                  <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-t-full bg-[var(--primary)]" />
                ) : null}
              </button>
            );
          })}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="my-1.5 h-8 w-8 self-center"
          onClick={onClose}
          aria-label="Close DevTools"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
      <DevToolsPanel report={report} activeTab={activeTab} currentTimeMs={currentTimeMs} seekTo={seekTo} />
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
      <div className="border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--divider)] bg-[var(--surface)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
          <span>{formatted.label}</span>
          <span className="tabular-nums normal-case tracking-normal text-[var(--ink-muted)]">
            {formatByteCount(new Blob([value]).size)}
          </span>
        </div>
        {formatted.note ? (
          <div className="border-b border-[var(--divider)] bg-[var(--surface)] px-3 py-1.5 font-mono text-[10px] leading-4 text-[var(--ink-muted)]">
            {formatted.note}
          </div>
        ) : null}
        {'parsedJson' in formatted && viewMode === 'tree' ? (
          <JsonTreeView value={formatted.parsedJson} />
        ) : (
          <pre className="thin-scrollbar overflow-x-auto whitespace-pre bg-[var(--bg)] px-3 py-2.5 font-mono text-[11px] leading-5 text-[var(--ink)]">
            {viewMode === 'raw' ? value : formatted.body}
          </pre>
        )}
      </div>
    </>
  );
}

function JsonTreeView({ value }: { value: unknown }) {
  return (
    <div className="thin-scrollbar overflow-x-auto bg-[var(--bg)] px-2 py-2 font-mono text-[11px] leading-5 text-[var(--ink)]">
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
      <div className="flex min-w-0 items-start gap-1.5 py-0.5" style={{ paddingLeft: `${depth * 14}px` }}>
        {name !== null ? <span className="shrink-0 text-[var(--ink-faint)]">{formatJsonKey(name)}:</span> : null}
        <JsonPrimitive value={value} />
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        className="flex w-full min-w-0 items-center gap-1.5 rounded-sm py-0.5 text-left transition-colors hover:bg-[var(--primary-subtle)]"
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        <span className="w-3 shrink-0 text-[var(--ink-faint)] transition-transform" style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
          ▾
        </span>
        {name !== null ? <span className="shrink-0 text-[var(--ink-faint)]">{formatJsonKey(name)}:</span> : null}
        <span className="text-[var(--ink-muted)]">
          {isArray ? '[' : '{'}
          {!isExpanded ? (
            <span className="text-[var(--ink-faint)]">
              {' '}
              {entries.length} {isArray ? 'items' : 'keys'} {isArray ? ']' : '}'}
            </span>
          ) : (
            ''
          )}
        </span>
      </button>
      {isExpanded ? (
        <>
          {entries.map(([entryName, entryValue]) => (
            <JsonTreeNode key={String(entryName)} name={entryName} value={entryValue} depth={depth + 1} />
          ))}
          <div className="py-0.5 text-[var(--ink-muted)]" style={{ paddingLeft: `${depth * 14 + 14}px` }}>
            {isArray ? ']' : '}'}
          </div>
        </>
      ) : null}
    </div>
  );
}

function JsonPrimitive({ value }: { value: unknown }) {
  if (typeof value === 'string') {
    return <span className="break-all text-[#3a5419]">{JSON.stringify(value)}</span>;
  }

  if (typeof value === 'number') {
    return <span className="text-[#7e5a14]">{value}</span>;
  }

  if (typeof value === 'boolean') {
    return <span className="text-[#a13c19]">{String(value)}</span>;
  }

  if (value === null) {
    return <span className="italic text-[var(--ink-faint)]">null</span>;
  }

  return <span className="break-all text-[var(--ink-muted)]">{String(value)}</span>;
}

function formatJsonKey(key: string | number) {
  return typeof key === 'number' ? key : JSON.stringify(key);
}

function CaptureStats({ report }: { report: ReportDetail }) {
  const stats = [
    { label: 'console', value: report.consoleLogs?.length ?? 0, color: 'var(--tl-console)' },
    { label: 'network', value: report.networkRequests?.length ?? 0, color: 'var(--tl-network)' },
    { label: 'actions', value: report.pageActions?.length ?? 0, color: 'var(--tl-action)' },
    { label: 'errors', value: report.runtimeErrors?.length ?? 0, color: 'var(--tl-error)' },
  ] as const;

  return (
    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[var(--border)] py-3 sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-6 sm:gap-y-2">
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-baseline gap-1.5">
          <span
            className="inline-block h-1.5 w-1.5 translate-y-[-2px] rounded-full"
            style={{ backgroundColor: stat.color }}
            aria-hidden
          />
          <span className="font-mono text-base font-semibold tabular-nums text-[var(--ink)]">
            {stat.value}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">
            {stat.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function CaptureContextBar({ report }: { report: ReportDetail }) {
  const session = report.captureSessions?.[0];
  const reporterName = report.reporter?.displayName || report.reporter?.email || 'Unknown reporter';
  const browser = [
    report.browserName ?? session?.browserName,
    report.browserVersion ?? session?.browserVersion,
  ].filter(Boolean).join(' ') || 'n/a';
  const osName = report.osName ?? session?.osName ?? inferOsName(report.userAgent ?? session?.userAgent ?? '') ?? 'n/a';
  const viewport =
    report.viewportWidth && report.viewportHeight
      ? `${report.viewportWidth} × ${report.viewportHeight}`
      : session?.viewportWidth && session.viewportHeight
        ? `${session.viewportWidth} × ${session.viewportHeight}`
        : 'n/a';

  const items = [
    {
      icon: UserRound,
      label: 'Reporter',
      value: reporterName,
    },
    {
      icon: Globe,
      label: 'Page',
      value: formatHost(report.pageUrl ?? session?.pageUrl) ?? 'n/a',
    },
    {
      icon: Monitor,
      label: 'Browser',
      value: browser,
    },
    {
      icon: AppWindow,
      label: 'Viewport',
      value: viewport,
    },
    {
      icon: Clock,
      label: 'Duration',
      value: formatDuration(session?.durationMs),
    },
    {
      icon: osIconForName(osName),
      label: 'OS',
      value: osName,
    },
  ];

  return (
    <div className="mt-5 grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-2 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--surface)]">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--primary-subtle)] text-[var(--primary)]">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
              {label}
            </div>
            <div className="truncate text-sm font-medium text-[var(--ink)]">{value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CommentAvatar({
  name,
  size = 'md',
}: {
  name: string;
  size?: 'sm' | 'md';
}) {
  const dimensions = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-[var(--primary)] font-semibold text-white ring-4 ring-[var(--bg)] ${dimensions}`}
      title={name}
    >
      {initialsFor(name)}
    </span>
  );
}

function RecordingHero({
  report,
  seekTargetMs,
  onSeekComplete,
  onTimeUpdate,
  onDurationLoad,
}: {
  report: ReportDetail;
  seekTargetMs: number | null;
  onSeekComplete: () => void;
  onTimeUpdate: (ms: number) => void;
  onDurationLoad: (ms: number) => void;
}) {
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
    if (seekTargetMs === null || !videoRef.current) return;
    videoRef.current.currentTime = seekTargetMs / 1000;
    if (videoRef.current.paused) {
      void videoRef.current.play().catch(() => undefined);
    }
    if (!isPlayerOpen) setIsPlayerOpen(true);
    onSeekComplete();
  }, [seekTargetMs, isPlayerOpen, onSeekComplete]);

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

    if (Number.isFinite(video.duration) && video.duration > 0) {
      onDurationLoad(video.duration * 1000);
    }

    if (!isPlayerOpen) {
      const seekTarget = Number.isFinite(video.duration) && video.duration > 0.6 ? 0.6 : 0.1;
      try {
        video.currentTime = seekTarget;
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
      className="relative aspect-[16/9] w-full overflow-hidden rounded-[14px] border border-[var(--border-strong)] bg-[var(--ink-strong)] shadow-[0_2px_8px_rgb(26_29_18_/_0.10)]"
    >
      {sourceUrl ? (
        <>
          {isScreenshot ? (
            <img
              className="h-full w-full bg-[#fafbf6] object-contain"
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
              onTimeUpdate={() => {
                if (videoRef.current) onTimeUpdate(videoRef.current.currentTime * 1000);
              }}
              onDurationChange={() => {
                if (videoRef.current && Number.isFinite(videoRef.current.duration)) {
                  onDurationLoad(videoRef.current.duration * 1000);
                }
              }}
              onError={() => setVideoError('Recording file cannot be played. The uploaded WebM may be invalid or unreachable.')}
            />
          )}
          {!isPlayerOpen && !isScreenshot ? (
            <>
              <div
                className={`absolute inset-0 bg-[linear-gradient(135deg,#be4400,#c64a1f_48%,#fafbf6)] transition-opacity ${
                  hasLoadedThumbnail ? 'opacity-0' : 'opacity-100'
                }`}
              />
              <div className="absolute inset-0 bg-black/30" />
              <button
                type="button"
                onClick={() => void loadRecording()}
                disabled={isLoadingSource}
                className="absolute left-1/2 top-1/2 flex h-[4.5rem] w-[4.5rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#1a1d12] shadow-[0_0_0_7px_rgba(255,255,255,0.22)]"
                aria-label="Play recording"
              >
                {isLoadingSource ? (
                  <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
                ) : (
                  <Play className="ml-1 h-9 w-9 fill-[#1a1d12]" aria-hidden />
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
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#be4400,#c64a1f_48%,#fafbf6)]" />
          <div className="absolute inset-0 bg-black/42" />
          <button
            type="button"
            onClick={() => void loadRecording()}
            disabled={!upload || isLoadingSource}
            className="absolute left-1/2 top-1/2 flex h-[4.5rem] w-[4.5rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#1a1d12] shadow-[0_0_0_7px_rgba(255,255,255,0.22)]"
          >
            {isLoadingSource ? (
              <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
            ) : (
              <Play className="ml-1 h-9 w-9 fill-[#1a1d12]" aria-hidden />
            )}
          </button>
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-xl bg-black/82 px-3 py-1.5 text-base font-medium text-white">
            {upload ? `${isScreenshot ? 'Screenshot' : 'Recording'} · ${formatBytes(upload.byteSize)}` : 'No recording'}
          </div>
          {videoError ? (
            <div className="absolute bottom-20 left-1/2 max-w-[80%] -translate-x-1/2 rounded-xl bg-[#e11d48] px-4 py-2 text-center text-sm font-medium text-white">
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
        <AlertTriangle className="mx-auto h-9 w-9 text-[#fecdd3]" aria-hidden />
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

function DevToolsPanel({
  report,
  activeTab,
  currentTimeMs,
  seekTo,
}: {
  report: ReportDetail;
  activeTab: DevToolsTab;
  currentTimeMs: number;
  seekTo: (ms: number) => void;
}) {
  if (activeTab === 'Timeline') {
    return <TimelinePanel entries={report.timeline ?? []} currentTimeMs={currentTimeMs} seekTo={seekTo} />;
  }

  if (activeTab === 'Info') {
    const session = report.captureSessions?.[0];
    const pageUrl = report.pageUrl ?? session?.pageUrl ?? '—';
    const userAgent = report.userAgent ?? session?.userAgent ?? '—';
    const browserName = report.browserName ?? session?.browserName ?? inferBrowserName(userAgent);
    const browser = [
      browserName,
      report.browserVersion ?? session?.browserVersion,
    ].filter(Boolean).join(' ') || '—';
    const osName = report.osName ?? session?.osName ?? inferOsName(userAgent) ?? '—';
    const viewportWidth = report.viewportWidth ?? session?.viewportWidth;
    const viewportHeight = report.viewportHeight ?? session?.viewportHeight;
    const screenSize = session?.screenWidth && session?.screenHeight
      ? `${session.screenWidth} × ${session.screenHeight}${session.devicePixelRatio ? ` @${session.devicePixelRatio}x` : ''}`
      : '—';

    return (
      <div className="thin-scrollbar h-full min-h-0 overflow-auto bg-[var(--bg)]">
        <SectionTitle title="Page" />
        <KeyValue label="URL" value={pageUrl} />
        <KeyValue label="Browser" value={<InfoValueWithIcon icon={<BrowserGlyph value={browser} />} value={browser} />} />
        <KeyValue label="OS" value={<InfoValueWithIcon icon={<OsGlyph value={osName} />} value={osName} />} />
        <KeyValue
          label="Viewport"
          value={viewportWidth && viewportHeight ? `${viewportWidth} × ${viewportHeight}` : '—'}
        />
        <KeyValue label="Screen" value={screenSize} />
        <SectionTitle title="Session" />
        <KeyValue label="Status" value={session?.status ?? '—'} />
        <KeyValue label="Duration" value={formatDuration(session?.durationMs)} />
        <KeyValue label="Timezone" value={session?.timezone ?? '—'} />
        <KeyValue label="Locale" value={session?.locale ?? '—'} />
        <KeyValue label="Extension" value={session?.extensionVersion ?? '—'} />
        <KeyValue label="User agent" value={userAgent} />
        <SectionTitle title="IDs" />
        <KeyValue label="Report ID" value={report.id} />
        <KeyValue label="Share token" value={report.shareToken ?? '—'} />
        {session?.id ? <KeyValue label="Session ID" value={session.id} /> : null}
      </div>
    );
  }

  if (activeTab === 'Console') {
    return <ConsoleActivityPanel report={report} currentTimeMs={currentTimeMs} seekTo={seekTo} />;
  }

  if (activeTab === 'Network') {
    return <NetworkPanel report={report} />;
  }

  if (activeTab === 'Actions') {
    return (
      <div className="thin-scrollbar h-full min-h-0 overflow-auto bg-[var(--bg)] p-3">
        <PanelEmptyState isEmpty={report.pageActions.length === 0} label="No user actions yet." />
        {report.pageActions.map((entry) => (
          <ActionTelemetryCard key={entry.id} entry={entry} />
        ))}
      </div>
    );
  }

  if (activeTab === 'Errors') {
    return (
      <div className="thin-scrollbar h-full min-h-0 overflow-auto bg-[var(--bg)] p-3">
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
      <div className="thin-scrollbar h-full min-h-0 overflow-auto bg-[var(--bg)] p-3">
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
      <div className="thin-scrollbar h-full min-h-0 overflow-auto bg-[var(--bg)] p-3">
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
        <div key={event.id} className="mb-3 rounded-xl border border-[#dfdcc9] bg-white p-4">
          <div className="font-semibold">{event.kind}</div>
          <div className="mt-1 text-sm text-[#7a7a72]">{formatDate(event.createdAt)}</div>
        </div>
      ))}
    </div>
  );
}

function ActionTelemetryCard({ entry }: { entry: PageActionEntry }) {
  const rows = actionRows(entry);
  const title = actionTitle(entry);
  const caption = actionCaption(entry);

  return (
    <div className="mb-2 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)] transition-colors hover:border-[var(--border-strong)]">
      <div className="border-b border-[var(--divider)] bg-[var(--surface)] px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ring-1 ${actionIconFrameClass(entry.kind)}`}
              title={actionKindLabel(entry.kind)}
              role="img"
              aria-label={actionKindLabel(entry.kind)}
            >
              <ActionKindIcon kind={entry.kind} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--ink)]">{title}</div>
              {caption ? (
                <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                  {caption}
                </div>
              ) : null}
            </div>
          </div>
          <div className="shrink-0 font-mono text-[11px] text-[var(--ink-faint)]">
            <span className="font-semibold text-[var(--ink-muted)]">{formatOffset(entry.offsetMs)}</span>
            <span className="px-1.5">·</span>
            <span>{formatDate(entry.occurredAt)}</span>
          </div>
        </div>
      </div>
      {rows.length > 0 ? (
        <div>
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="grid grid-cols-1 border-b border-[var(--divider)] text-xs transition-colors last:border-b-0 hover:bg-[var(--surface)] sm:grid-cols-[7rem_1fr]"
            >
              <div className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                {label}
              </div>
              <div className="break-words px-3 pb-1.5 font-mono text-[11px] leading-5 text-[var(--ink)] sm:py-1.5">
                {value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ActionKindIcon({ kind }: { kind: string }) {
  const className = 'h-4 w-4';

  if (kind === 'SCROLL') return <MoveVertical className={className} aria-hidden />;
  if (kind === 'KEY_PRESS') return <Keyboard className={className} aria-hidden />;
  if (kind === 'NAVIGATION' || kind === 'ROUTE_CHANGE') return <Navigation className={className} aria-hidden />;
  if (kind === 'INPUT' || kind === 'FORM_SUBMIT') return <TextCursorInput className={className} aria-hidden />;
  if (kind === 'CLICK' || kind === 'DOUBLE_CLICK') return <MousePointerClick className={className} aria-hidden />;

  return <MousePointer2 className={className} aria-hidden />;
}

function actionIconFrameClass(kind: string): string {
  if (kind === 'SCROLL') return 'bg-[var(--accent-cool-soft)] text-[var(--accent-cool)] ring-[var(--border-cool)]';
  if (kind === 'KEY_PRESS') return 'bg-[var(--warning-bg)] text-[var(--warning)] ring-[var(--warning-border)]';
  if (kind === 'NAVIGATION' || kind === 'ROUTE_CHANGE') {
    return 'bg-[var(--success-bg)] text-[var(--success)] ring-[var(--success)]';
  }
  if (kind === 'INPUT' || kind === 'FORM_SUBMIT') {
    return 'bg-[var(--surface-cool)] text-[var(--accent-cool)] ring-[var(--border-cool)]';
  }
  if (kind === 'CLICK' || kind === 'DOUBLE_CLICK') {
    return 'bg-[var(--primary-subtle)] text-[var(--primary)] ring-[var(--primary-soft)]';
  }
  return 'bg-[var(--surface)] text-[var(--ink-muted)] ring-[var(--border)]';
}

function actionKindLabel(kind: string): string {
  if (kind === 'SCROLL') return 'Viewport movement';
  if (kind === 'KEY_PRESS') return 'Keyboard action';
  if (kind === 'NAVIGATION' || kind === 'ROUTE_CHANGE') return 'Navigation';
  if (kind === 'INPUT') return 'Input change';
  if (kind === 'FORM_SUBMIT') return 'Form submit';
  if (kind === 'CLICK' || kind === 'DOUBLE_CLICK') return 'Pointer action';
  return kind.replace(/_/g, ' ').toLowerCase();
}

function actionTitle(entry: PageActionEntry): string {
  if (entry.kind === 'SCROLL') {
    return entry.label && entry.label !== 'Window scroll' ? entry.label : 'Viewport moved';
  }

  if (entry.kind === 'NAVIGATION' || entry.kind === 'ROUTE_CHANGE') {
    return entry.label ?? readableUrl(entry.pageUrl) ?? 'Page changed';
  }

  if (entry.kind === 'KEY_PRESS') {
    return entry.label ? `Key ${entry.label}` : entry.selector ?? 'Keyboard action';
  }

  if (entry.kind === 'INPUT' || entry.kind === 'FORM_SUBMIT') {
    return entry.label ?? entry.selector ?? 'Field updated';
  }

  return entry.label ?? entry.textPreview ?? entry.valuePreview ?? entry.selector ?? actionKindLabel(entry.kind);
}

function actionCaption(entry: PageActionEntry): string | null {
  const parts = [
    actionKindLabel(entry.kind),
    entry.tagName ? entry.tagName.toLowerCase() : null,
    formatPointerPosition(entry),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function actionRows(entry: PageActionEntry): Array<[string, string]> {
  const rows: Array<[string, string]> = [];

  if (entry.kind === 'SCROLL') {
    pushActionRow(rows, 'Viewport', formatScrollPosition(entry));
    pushActionRow(rows, 'Container', entry.label === 'Window scroll' ? undefined : entry.label);
    pushActionRow(rows, 'Selector', entry.selector);
    pushActionRow(rows, 'Page URL', entry.pageUrl);
    return rows.length > 0 ? rows : [['Details', 'Viewport position was not captured']];
  }

  if (entry.kind === 'NAVIGATION' || entry.kind === 'ROUTE_CHANGE') {
    pushActionRow(rows, 'Trigger', entry.label);
    pushActionRow(rows, 'Page URL', entry.pageUrl);
    return rows.length > 0 ? rows : [['Details', 'Navigation details were not captured']];
  }

  if (entry.kind === 'KEY_PRESS') {
    pushActionRow(rows, 'Key', entry.label);
    pushActionRow(rows, 'Target', entry.selector);
    pushActionRow(rows, 'Tag', entry.tagName);
    pushActionRow(rows, 'Page URL', entry.pageUrl);
    return rows.length > 0 ? rows : [['Details', 'Key press details were not captured']];
  }

  pushActionRow(rows, 'Target', entry.label ?? entry.textPreview ?? entry.selector);
  pushActionRow(rows, 'Tag', entry.tagName);
  if (entry.textPreview && entry.textPreview !== entry.label) {
    pushActionRow(rows, 'Text', entry.textPreview);
  }
  pushActionRow(rows, 'Value', entry.valuePreview);
  pushActionRow(rows, 'Position', formatPointerPosition(entry));
  pushActionRow(rows, 'Selector', entry.selector);
  pushActionRow(rows, 'Page URL', entry.pageUrl);

  return rows.length > 0 ? rows : [['Details', 'No additional details captured']];
}

function pushActionRow(rows: Array<[string, string]>, label: string, value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) {
    return;
  }
  rows.push([label, normalized]);
}

function formatPointerPosition(entry: PageActionEntry): string | null {
  if (typeof entry.x !== 'number' || typeof entry.y !== 'number') {
    return null;
  }
  return `x ${entry.x}, y ${entry.y}`;
}

function formatScrollPosition(entry: PageActionEntry): string | null {
  if (typeof entry.scrollX !== 'number' && typeof entry.scrollY !== 'number') {
    return null;
  }
  return `left ${entry.scrollX ?? 0}, top ${entry.scrollY ?? 0}`;
}

function readableUrl(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return value;
  }
}

function formatHost(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).host.replace(/^www\./, '');
  } catch {
    return value;
  }
}

function initialsFor(value: string): string {
  const initials = value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return initials || 'W';
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
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] overflow-hidden bg-[#fafbf6]">
      <div className="border-b border-[#dad7c8] bg-white/90 p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#83887a]" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 rounded-lg border-[#dad7c8] bg-white pl-8 text-xs"
            placeholder="Filter backend method, URL, status"
          />
        </div>
      </div>
      <div className="grid min-h-0 grid-cols-1 overflow-hidden md:grid-cols-[minmax(14rem,0.85fr)_minmax(0,1.15fr)]">
        <div className="thin-scrollbar min-h-0 overflow-auto border-r border-[#dad7c8] bg-white">
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
                className={`grid w-full grid-cols-[1.5rem_minmax(0,1fr)] gap-2 border-b border-[#ecede2] px-3 py-2.5 text-left transition-colors ${
                  isSelected ? 'bg-[#f6f7eb]' : 'hover:bg-[#fafbf6]'
                }`}
              >
                <span className="pt-0.5 text-right font-mono text-[10px] text-[#95988b]">{index + 1}</span>
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${backendStatusDotClass(trace)}`} />
                    <span className="truncate text-xs font-semibold text-[#1a1d12]">{trace.operationName}</span>
                  </span>
                  <span className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-[10px] text-[#6f7461]">
                    <span className="shrink-0 rounded bg-[#f4f6e8] px-1.5 py-0.5 text-[#27291d]">{trace.method ?? 'TRACE'}</span>
                    <span className={backendStatusTextClass(trace)}>{trace.statusCode ?? trace.status}</span>
                    <span className="truncate">{trace.url ? getDomain(trace.url) : trace.serviceName ?? 'backend'}</span>
                  </span>
                  <span className="mt-1 block text-[10px] text-[#83887a]">
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
              <div className="rounded-xl border border-[#dad7c8] bg-[#fbfcf7] p-4 shadow-[0_10px_28px_rgba(21,32,54,0.05)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={selectedTrace.status === 'ERROR' ? 'danger' : 'success'}>
                        {selectedTrace.status}
                      </Badge>
                      <span className="rounded-md bg-white px-2 py-1 font-mono text-xs text-[#27291d] ring-1 ring-[#dad7c8]">
                        {selectedTrace.method ?? 'n/a'}
                      </span>
                      <span className="text-xs text-[#6f7461]">{formatDuration(selectedTrace.durationMs)}</span>
                    </div>
                    <h3 className="mt-3 break-words text-sm font-semibold leading-5 text-[#1a1d12]">
                      {selectedTrace.operationName}
                    </h3>
                  </div>
                  <Server className="h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden />
                </div>
                <div className="mt-3 rounded-lg border border-[#dad7c8] bg-white px-3 py-2 font-mono text-[11px] leading-5 text-[#27291d]">
                  <span className="break-all">{selectedTrace.url ?? selectedTrace.serviceName ?? 'n/a'}</span>
                </div>
              </div>

              <div className="mt-3 overflow-hidden rounded-xl border border-[#dad7c8] bg-white">
                <SectionTitle title="Trace" />
                <KeyValue label="HTTP status" value={selectedTrace.statusCode === null || selectedTrace.statusCode === undefined ? 'n/a' : String(selectedTrace.statusCode)} />
                <KeyValue label="Service" value={selectedTrace.serviceName ?? 'n/a'} />
                <KeyValue label="Trace ID" value={selectedTrace.traceId ?? 'n/a'} />
                <KeyValue label="Span ID" value={selectedTrace.spanId ?? 'n/a'} />
                <KeyValue label="Parent span" value={selectedTrace.parentSpanId ?? 'n/a'} />
                <KeyValue label="Started" value={formatDate(selectedTrace.startedAt)} />
                <KeyValue label="Ended" value={selectedTrace.endedAt ? formatDate(selectedTrace.endedAt) : 'n/a'} />
              </div>

              <div className="mt-3 overflow-hidden rounded-xl border border-[#dad7c8] bg-white">
                <SectionTitle title="Metadata" />
                <div className="thin-scrollbar max-h-64 overflow-auto p-3 font-mono text-[11px]">
                  {selectedTrace.metadata ? <JsonTreeView value={selectedTrace.metadata} /> : <span className="text-[#83887a]">n/a</span>}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-sm text-[#6f7461]">Select a backend trace to inspect it.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelinePanel({
  entries,
  currentTimeMs,
  seekTo,
}: {
  entries: TimelineEntry[];
  currentTimeMs: number;
  seekTo: (ms: number) => void;
}) {
  const activeId = useMemo(() => {
    if (currentTimeMs <= 0) return null;
    let best: TimelineEntry | null = null;
    for (const entry of entries) {
      if (entry.offsetMs == null) continue;
      if (entry.offsetMs <= currentTimeMs) best = entry;
      else break;
    }
    return best ? `${best.type}-${best.id}` : null;
  }, [entries, currentTimeMs]);

  return (
    <div className="thin-scrollbar h-full min-h-0 overflow-auto bg-[var(--bg)] p-4">
      <PanelEmptyState isEmpty={entries.length === 0} label="No timeline entries yet." />
      <div className="space-y-2">
        {entries.map((entry) => {
          const key = `${entry.type}-${entry.id}`;
          const isActive = key === activeId;
          return (
            <div
              key={key}
              className={`rounded-lg border p-3 transition-colors ${
                isActive
                  ? 'border-[var(--primary)] bg-[var(--primary-subtle)]'
                  : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--border-strong)]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[var(--surface)] text-[var(--primary)]">
                    <TimelineIcon type={entry.type} />
                  </span>
                  <Badge tone={entry.severity as BadgeTone}>{entry.type}</Badge>
                  <div className="min-w-0 truncate text-sm font-semibold text-[var(--ink)]">{entry.title}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-[var(--ink-faint)]">
                  <span>{formatOffset(entry.offsetMs)}</span>
                  <span>·</span>
                  <span>{formatDate(entry.timestamp)}</span>
                  {entry.offsetMs != null ? (
                    <button
                      type="button"
                      onClick={() => seekTo(entry.offsetMs!)}
                      className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)]"
                    >
                      jump
                    </button>
                  ) : null}
                </div>
              </div>
              {entry.subtitle ? (
                <div className="mt-2 break-all font-mono text-[11px] leading-5 text-[var(--ink-muted)]">
                  {entry.subtitle}
                </div>
              ) : null}
            </div>
          );
        })}
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
    <div className="mb-2 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)] transition-colors hover:border-[var(--border-strong)]">
      <div className="border-b border-[var(--divider)] bg-[var(--surface)] px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Badge tone={tone}>{title}</Badge>
            {subtitle ? (
              <div className="min-w-0 truncate text-sm font-semibold text-[var(--ink)]">{subtitle}</div>
            ) : null}
          </div>
          <div className="shrink-0 font-mono text-[11px] text-[var(--ink-faint)]">
            <span className="font-semibold text-[var(--ink-muted)]">{formatOffset(offsetMs)}</span>
            <span className="px-1.5">·</span>
            <span>{formatDate(timestamp)}</span>
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
    <div className="m-4 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
      <div className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">{label}</div>
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

function ConsoleActivityPanel({
  report,
  currentTimeMs,
  seekTo,
}: {
  report: ReportDetail;
  currentTimeMs: number;
  seekTo: (ms: number) => void;
}) {
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

  const levelOptions: ConsoleLevelFilter[] = ['All levels', 'Errors', 'Warnings', 'Info'];
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] overflow-hidden bg-[var(--bg)]">
      <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-faint)]"
            aria-hidden
          />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="h-8 border-[var(--border)] bg-[var(--surface)] pl-8 font-mono text-xs"
            placeholder="Filter message, URL, stack…"
          />
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5">
          {levelOptions.map((option) => {
            const active = option === levelFilter;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setLevelFilter(option)}
                className={`h-7 rounded-[5px] px-2 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                  active
                    ? 'bg-[var(--bg)] font-semibold text-[var(--ink)] shadow-[0_0_0_1px_var(--border)]'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                }`}
              >
                {option === 'All levels' ? 'all' : option.toLowerCase()}
              </button>
            );
          })}
        </div>
      </div>
      <div className="thin-scrollbar min-h-0 overflow-auto bg-[var(--bg)]">
        <PanelEmptyState
          isEmpty={filteredRows.length === 0}
          label={rows.length === 0 ? 'No console logs yet.' : 'No matching console logs.'}
        />
        {filteredRows.map((row) => {
          const isActive = currentTimeMs > 0 && row.offsetMs != null && Math.abs(row.offsetMs - currentTimeMs) < 1500;
          return (
            <div
              key={row.id}
              className={`group grid grid-cols-[3.5rem_1rem_1fr_auto] items-start gap-2.5 border-b px-3 py-2 font-mono text-[11px] transition-colors ${consoleRowClass(row.tone)} ${
                isActive ? 'border-l-2 border-l-[var(--primary)] bg-[var(--primary-subtle)]' : 'border-l-2 border-l-transparent'
              }`}
            >
              <div className="pt-0.5 text-right tabular-nums text-[var(--ink-faint)]">{formatOffset(row.offsetMs)}</div>
              <div className="pt-0.5">
                <ConsoleRowIcon row={row} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="font-semibold">{row.title}</span>
                  {row.url ? <span className="break-all text-[var(--ink-faint)]">{row.url}</span> : null}
                </div>
                {row.message ? (
                  <div className="mt-1 whitespace-pre-wrap break-all leading-5 text-[var(--ink-muted)]">
                    {row.message}
                  </div>
                ) : null}
              </div>
              {row.offsetMs != null ? (
                <button
                  type="button"
                  onClick={() => seekTo(row.offsetMs!)}
                  className="self-start rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)] opacity-0 transition-opacity hover:bg-[var(--primary-subtle)] hover:text-[var(--primary)] focus:opacity-100 group-hover:opacity-100"
                >
                  jump
                </button>
              ) : null}
            </div>
          );
        })}
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
  const className = 'h-3.5 w-3.5';

  if (row.kind === 'runtime-error') {
    return <AlertTriangle className={`${className} text-[var(--danger)]`} aria-hidden />;
  }

  return <Terminal className={`${className} text-[var(--ink-faint)]`} aria-hidden />;
}

function consoleRowClass(tone: ConsoleRow['tone']) {
  if (tone === 'danger') {
    return 'border-[var(--divider)] bg-[var(--danger-bg)]/35 text-[var(--danger-strong)]';
  }

  if (tone === 'warning') {
    return 'border-[var(--divider)] bg-[var(--accent-soft)]/35 text-[#a13c19]';
  }

  return 'border-[var(--divider)] bg-[var(--bg)] text-[var(--ink)]';
}

function backendStatusDotClass(trace: BackendTraceEntry) {
  if (trace.status === 'ERROR' || (trace.statusCode ?? 0) >= 500) {
    return 'bg-[#e11d48]';
  }

  if ((trace.statusCode ?? 0) >= 400) {
    return 'bg-[#c64a1f]';
  }

  if (trace.status === 'OK' || (trace.statusCode !== null && trace.statusCode !== undefined && trace.statusCode < 400)) {
    return 'bg-[#5d8a3b]';
  }

  return 'bg-[#95988b]';
}

function backendStatusTextClass(trace: BackendTraceEntry) {
  if (trace.status === 'ERROR' || (trace.statusCode ?? 0) >= 500) {
    return 'shrink-0 font-semibold text-[#be123c]';
  }

  if ((trace.statusCode ?? 0) >= 400) {
    return 'shrink-0 font-semibold text-[#a13c19]';
  }

  return 'shrink-0 font-semibold text-[#3a5419]';
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
    <div className="grid h-full min-h-0 min-w-0 grid-rows-[auto_1fr] overflow-hidden bg-[var(--bg)]">
      <div className="min-w-0 border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-faint)]"
              aria-hidden
            />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="h-8 border-[var(--border)] bg-[var(--surface)] pl-8 font-mono text-xs"
              placeholder="Filter method, URL, status, domain…"
            />
          </div>
          <button
            type="button"
            onClick={() => setErrorsOnly((value) => !value)}
            aria-pressed={errorsOnly}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              errorsOnly
                ? 'border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            <AlertTriangle className="h-3 w-3" aria-hidden />
            errors only
          </button>
        </div>
        <div className="scrollbar-none mt-2 flex gap-1 overflow-x-auto pb-0.5">
          {networkFilterLabels.map((item) => {
            const active = item === activeFilter;
            return (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setActiveFilter(item);
                  setSelectedRequestId(null);
                }}
                className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                  networkFilterButtonClass(item, active)
                }`}
              >
                <NetworkTypeIcon category={item} className={`h-3.5 w-3.5 ${networkTypeIconClass(item, active)}`} />
                {item}
              </button>
            );
          })}
        </div>
      </div>
      <div
        className="grid min-h-0 min-w-0 grid-cols-1 overflow-hidden lg:[grid-template-columns:var(--network-list-width)_6px_minmax(0,1fr)]"
        style={{ '--network-list-width': `${requestListWidth}px` } as CSSProperties}
      >
        <div className="thin-scrollbar min-h-0 overflow-auto border-b border-[var(--border)] bg-[var(--bg)] lg:border-b-0 lg:border-r">
          <PanelEmptyState
            isEmpty={filteredRequests.length === 0}
            label={report.networkRequests.length === 0 ? 'No network requests yet.' : 'No matching requests.'}
          />
          {filteredRequests.map((request, index) => {
            const isSelected = selected?.id === request.id;
            const category = classifyNetworkRequest(request);
            return (
              <button
                key={request.id}
                type="button"
                onClick={() => setSelectedRequestId(request.id)}
                className={`grid w-full grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-1.5 border-b border-[var(--divider)] border-l-2 px-2 py-2 text-left transition-colors ${
                  isSelected
                    ? `${networkRowAccentClass(category)} bg-[var(--primary-subtle)]`
                    : `${networkRowAccentClass(category, true)} hover:bg-[var(--surface)]`
                }`}
              >
                <span className="pt-0.5 text-right font-mono text-[10px] tabular-nums text-[var(--ink-faint)]">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <NetworkRequestIcon request={request} />
                    <span className="truncate text-[12px] font-semibold leading-4 text-[var(--ink)]">
                      {shortRequestName(request.url)}
                    </span>
                  </span>
                  <span className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden font-mono text-[10px] leading-3">
                    <span className={`shrink-0 rounded px-1 py-px font-semibold ${networkMethodBadgeClass(request.method)}`}>
                      {request.method}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1 py-px font-semibold ${networkStatusBadgeClass(request.statusCode, request.error)}`}
                    >
                      {request.statusCode ?? 'ERR'}
                    </span>
                    <span className="truncate text-[var(--ink-faint)]">{getDomain(request.url)}</span>
                  </span>
                </span>
                <span className="pt-0.5 text-right font-mono text-[10px] tabular-nums text-[var(--ink-faint)]">
                  {request.durationMs ?? 0}ms
                </span>
              </button>
            );
          })}
        </div>
        <ResizeGrip
          label="Resize request list"
          className="hidden h-full cursor-col-resize border-r border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--primary-subtle)] lg:block"
          onPointerDown={handleRequestListResize}
        />
        <div className="grid min-h-0 min-w-0 grid-rows-[auto_1fr] overflow-hidden bg-[var(--bg)]">
          {/* One horizontally-scrollable strip. Every child is shrink-0 so the
              row overflows naturally and scrolls continuously to the very end
              (curl included). No flex-1, no pinned split, no ml-auto. */}
          <div className="thin-scrollbar-x flex h-10 shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-[var(--border)] bg-[var(--bg)] px-1.5">
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
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink-muted)]"
            >
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
            </button>
            {networkDetailTabs.map((tab) => {
              const active = activeDetailTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveDetailTab(tab)}
                  className={`relative h-9 shrink-0 px-2.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                    active
                      ? 'font-semibold text-[var(--ink)]'
                      : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {tab}
                  {active ? (
                    <span className="absolute inset-x-1.5 bottom-0 h-[2px] rounded-t-full bg-[var(--primary)]" />
                  ) : null}
                </button>
              );
            })}
            <span className="mx-0.5 h-5 w-px shrink-0 bg-[var(--border)]" aria-hidden />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 font-mono text-[10px] uppercase tracking-wider"
              title={bodyViewMode === 'tree' ? 'Show raw body' : 'Show parsed tree'}
              onClick={() => setBodyViewMode((mode) => (mode === 'tree' ? 'raw' : 'tree'))}
            >
              {bodyViewMode === 'tree' ? <FileCode2 className="h-3.5 w-3.5" aria-hidden /> : <ListTree className="h-3.5 w-3.5" aria-hidden />}
              {bodyViewMode === 'tree' ? 'raw' : 'tree'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 font-mono text-[10px] uppercase tracking-wider"
              disabled={!selected?.responseBody}
              title="Copy response body"
              onClick={() => void handleCopyResponseBody()}
            >
              {copyFeedback === 'response' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copyFeedback === 'response' ? 'copied' : 'body'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 font-mono text-[10px] uppercase tracking-wider"
              disabled={!selected}
              onClick={() => void handleCopyCurl()}
              title="Copy as cURL"
            >
              {copyFeedback === 'curl' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copyFeedback === 'curl' ? 'copied' : 'curl'}
            </Button>
          </div>
          <div className="thin-scrollbar min-h-0 overflow-auto">
            {selected ? (
              <NetworkRequestDetails request={selected} activeTab={activeDetailTab} bodyViewMode={bodyViewMode} />
            ) : (
              <div className="p-8 text-center font-mono text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">
                select a request to inspect
              </div>
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
        className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[#1a1d12] text-[9px] font-bold leading-none text-white ring-1 ring-black/10"
      >
        N
      </span>
    );
  }

  const category = classifyNetworkRequest(request);

  return (
    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md ring-1 ${networkIconFrameClass(category)}`}>
      <NetworkTypeIcon category={category} className={`h-3.5 w-3.5 ${networkTypeIconClass(category, true)}`} />
    </span>
  );
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

function networkFilterButtonClass(category: NetworkFilter, active: boolean) {
  if (active) {
    switch (category) {
      case 'Fetch/XHR':
        return 'border border-[var(--primary)] bg-[var(--primary)] text-white';
      case 'WS':
        return 'border border-[var(--accent-cool)] bg-[var(--accent-cool)] text-white';
      case 'JS':
        return 'border border-[#b7791f] bg-[#b7791f] text-white';
      case 'CSS':
        return 'border border-[#7c3aed] bg-[#7c3aed] text-white';
      case 'Media':
        return 'border border-[var(--success)] bg-[var(--success)] text-white';
      case 'Font':
        return 'border border-[#4f46e5] bg-[#4f46e5] text-white';
      case 'Doc':
        return 'border border-[var(--ink-muted)] bg-[var(--ink-muted)] text-white';
      case 'Other':
        return 'border border-[#64748b] bg-[#64748b] text-white';
      case 'All':
      default:
        return 'border border-[var(--primary)] bg-[var(--primary)] text-white';
    }
  }

  switch (category) {
    case 'Fetch/XHR':
      return 'border border-transparent text-[var(--primary)] hover:border-[var(--primary-soft)] hover:bg-[var(--primary-subtle)]';
    case 'WS':
      return 'border border-transparent text-[var(--accent-cool)] hover:border-[var(--accent-cool-soft)] hover:bg-[var(--accent-cool-soft)]';
    case 'JS':
      return 'border border-transparent text-[#9a5b00] hover:border-[#f2d38a] hover:bg-[#fff4d6]';
    case 'CSS':
      return 'border border-transparent text-[#6d28d9] hover:border-[#ddd6fe] hover:bg-[#f3e8ff]';
    case 'Media':
      return 'border border-transparent text-[var(--success)] hover:border-[#b7e4c4] hover:bg-[var(--success-bg)]';
    case 'Font':
      return 'border border-transparent text-[#4338ca] hover:border-[#c7d2fe] hover:bg-[#eef2ff]';
    case 'Doc':
      return 'border border-transparent text-[var(--ink-muted)] hover:border-[var(--border)] hover:bg-[var(--surface)] hover:text-[var(--ink)]';
    case 'Other':
      return 'border border-transparent text-[#64748b] hover:border-[#cbd5e1] hover:bg-[#f1f5f9]';
    case 'All':
    default:
      return 'border border-transparent text-[var(--ink-muted)] hover:border-[var(--primary-soft)] hover:bg-[var(--primary-subtle)] hover:text-[var(--primary)]';
  }
}

function networkTypeIconClass(category: NetworkFilter, active = false) {
  if (active) {
    return 'text-current';
  }

  switch (category) {
    case 'Fetch/XHR':
      return 'text-[var(--primary)]';
    case 'WS':
      return 'text-[var(--accent-cool)]';
    case 'JS':
      return 'text-[#b7791f]';
    case 'CSS':
      return 'text-[#7c3aed]';
    case 'Media':
      return 'text-[var(--success)]';
    case 'Font':
      return 'text-[#4f46e5]';
    case 'Doc':
      return 'text-[var(--ink-muted)]';
    case 'Other':
      return 'text-[#64748b]';
    case 'All':
    default:
      return 'text-[var(--primary)]';
  }
}

function networkIconFrameClass(category: NetworkFilter) {
  switch (category) {
    case 'Fetch/XHR':
      return 'bg-[var(--primary-subtle)] text-[var(--primary)] ring-[var(--primary-soft)]';
    case 'WS':
      return 'bg-[var(--accent-cool-soft)] text-[var(--accent-cool)] ring-[var(--border-cool)]';
    case 'JS':
      return 'bg-[#fff4d6] text-[#9a5b00] ring-[#f2d38a]';
    case 'CSS':
      return 'bg-[#f3e8ff] text-[#6d28d9] ring-[#ddd6fe]';
    case 'Media':
      return 'bg-[var(--success-bg)] text-[var(--success)] ring-[#b7e4c4]';
    case 'Font':
      return 'bg-[#eef2ff] text-[#4338ca] ring-[#c7d2fe]';
    case 'Doc':
      return 'bg-[var(--surface)] text-[var(--ink-muted)] ring-[var(--border)]';
    case 'Other':
    case 'All':
    default:
      return 'bg-[#f1f5f9] text-[#64748b] ring-[#cbd5e1]';
  }
}

function networkRowAccentClass(category: NetworkFilter, inactive = false) {
  if (inactive) {
    return 'border-l-transparent';
  }

  switch (category) {
    case 'Fetch/XHR':
      return 'border-l-[var(--primary)]';
    case 'WS':
      return 'border-l-[var(--accent-cool)]';
    case 'JS':
      return 'border-l-[#b7791f]';
    case 'CSS':
      return 'border-l-[#7c3aed]';
    case 'Media':
      return 'border-l-[var(--success)]';
    case 'Font':
      return 'border-l-[#4f46e5]';
    case 'Doc':
      return 'border-l-[var(--ink-muted)]';
    case 'Other':
    case 'All':
    default:
      return 'border-l-[#64748b]';
  }
}

function networkMethodBadgeClass(method: string) {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'bg-[var(--success-bg)] text-[#2f6b38]';
    case 'POST':
      return 'bg-[var(--primary-subtle)] text-[var(--primary)]';
    case 'PUT':
    case 'PATCH':
      return 'bg-[#fff4d6] text-[#8a5200]';
    case 'DELETE':
      return 'bg-[var(--danger-bg)] text-[var(--danger)]';
    default:
      return 'bg-[var(--surface)] text-[var(--ink-muted)]';
  }
}

function networkStatusBadgeClass(statusCode: number | null | undefined, error?: string | null) {
  if (error || (statusCode ?? 0) >= 400) {
    return 'bg-[var(--danger-bg)] text-[var(--danger)]';
  }

  if ((statusCode ?? 0) >= 300) {
    return 'bg-[#fff4d6] text-[#8a5200]';
  }

  return 'bg-[var(--success-bg)] text-[#2f6b38]';
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
  return (
    <div className="sticky top-0 z-10 border-y border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
      {title}
    </div>
  );
}

function InfoValueWithIcon({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[var(--surface)] ring-1 ring-[var(--border)]">
        {icon}
      </span>
      <span className="min-w-0 break-all">{value}</span>
    </span>
  );
}

function BrowserGlyph({ value }: { value: string }) {
  const normalized = value.toLowerCase();

  if (normalized.includes('chrome') || normalized.includes('chromium')) {
    return <ChromeGlyph />;
  }

  if (normalized.includes('safari')) {
    return <Globe className="h-3.5 w-3.5 text-[#2563eb]" aria-hidden />;
  }

  if (normalized.includes('firefox')) {
    return <Globe className="h-3.5 w-3.5 text-[#f97316]" aria-hidden />;
  }

  if (normalized.includes('edge')) {
    return <AppWindow className="h-3.5 w-3.5 text-[#0f9f9a]" aria-hidden />;
  }

  if (normalized.includes('arc')) {
    return <AppWindow className="h-3.5 w-3.5 text-[#111827]" aria-hidden />;
  }

  return <AppWindow className="h-3.5 w-3.5 text-[var(--ink-muted)]" aria-hidden />;
}

function OsGlyph({ value }: { value: string }) {
  const normalized = value.toLowerCase();

  if (normalized.includes('windows')) {
    return <WindowsGlyph />;
  }

  if (
    normalized.includes('mac') ||
    normalized.includes('ios') ||
    normalized.includes('iphone') ||
    normalized.includes('ipad')
  ) {
    return <Apple className="h-3.5 w-3.5 text-[#1a1d12]" aria-hidden />;
  }

  if (normalized.includes('android')) {
    return <Smartphone className="h-3.5 w-3.5 text-[var(--success)]" aria-hidden />;
  }

  if (normalized.includes('linux') || normalized.includes('ubuntu')) {
    return <Terminal className="h-3.5 w-3.5 text-[#b7791f]" aria-hidden />;
  }

  return <Monitor className="h-3.5 w-3.5 text-[var(--ink-muted)]" aria-hidden />;
}

function osIconForName(value: string): typeof Monitor {
  const normalized = value.toLowerCase();

  if (
    normalized.includes('mac') ||
    normalized.includes('ios') ||
    normalized.includes('iphone') ||
    normalized.includes('ipad')
  ) {
    return Apple;
  }

  if (normalized.includes('android')) {
    return Smartphone;
  }

  if (normalized.includes('windows') || normalized.includes('linux')) {
    return Monitor;
  }

  return AppWindow;
}

function ChromeGlyph() {
  return (
    <span
      className="relative h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
      style={{
        background:
          'conic-gradient(#16a34a 0deg 115deg, #facc15 115deg 235deg, #ef4444 235deg 360deg)',
      }}
      aria-hidden
    >
      <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2563eb] ring-1 ring-white" />
    </span>
  );
}

function WindowsGlyph() {
  return (
    <span className="grid h-3.5 w-3.5 grid-cols-2 gap-[1px]" aria-hidden>
      <span className="bg-[#0078d4]" />
      <span className="bg-[#0078d4]" />
      <span className="bg-[#0078d4]" />
      <span className="bg-[#0078d4]" />
    </span>
  );
}

function inferBrowserName(userAgent: string) {
  if (!userAgent || userAgent === '—') return null;
  if (/edg\//i.test(userAgent)) return 'Edge';
  if (/firefox\//i.test(userAgent)) return 'Firefox';
  if (/chrome\//i.test(userAgent) || /chromium\//i.test(userAgent)) return 'Chrome';
  if (/safari\//i.test(userAgent)) return 'Safari';
  return null;
}

function inferOsName(userAgent: string) {
  if (!userAgent || userAgent === '—') return null;
  if (/windows nt/i.test(userAgent)) return 'Windows';
  if (/mac os x/i.test(userAgent)) return 'macOS';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'iOS';
  if (/android/i.test(userAgent)) return 'Android';
  if (/linux/i.test(userAgent)) return 'Linux';
  return null;
}

function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-1 border-b border-[var(--divider)] text-xs transition-colors last:border-b-0 hover:bg-[var(--surface)] sm:grid-cols-[8rem_1fr]">
      <div className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">{label}</div>
      <div className="break-all px-3 pb-1.5 font-mono text-[11px] text-[var(--ink)] sm:py-1.5">{value}</div>
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

  if (/\.m?js(\?|$)/.test(url) || contentType.includes('javascript')) {
    return 'JS';
  }

  if (/\.css(\?|$)/.test(url) || contentType.includes('text/css')) {
    return 'CSS';
  }

  if (
    contentType.includes('image/') ||
    contentType.includes('video/') ||
    contentType.includes('audio/') ||
    /\.(avif|gif|jpe?g|mp3|mp4|ogg|png|svg|webm|webp)(\?|$)/.test(url)
  ) {
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

/** Single source of truth for timeline event kinds — used by BOTH the track
    dots and the legend, so they can never drift apart. Colors reference the
    --tl-* design tokens (no hardcoded hex). */
const TIMELINE_KIND_META: { kind: string; label: string; color: string }[] = [
  { kind: 'CONSOLE', label: 'console', color: 'var(--tl-console)' },
  { kind: 'NETWORK', label: 'network', color: 'var(--tl-network)' },
  { kind: 'ERROR', label: 'error', color: 'var(--tl-error)' },
];

const VISIBLE_TIMELINE_KINDS = new Set(TIMELINE_KIND_META.map((meta) => meta.kind));

const timelineEventColors: Record<string, string> = {
  ...Object.fromEntries(TIMELINE_KIND_META.map((meta) => [meta.kind, meta.color])),
  // Lifecycle markers reuse the action hue so they read as "the spine".
  SESSION: 'var(--tl-action)',
  UPLOAD: 'var(--tl-action)',
  EVENT: 'var(--tl-action)',
};

function TimelineScrubber({
  currentMs,
  durationMs,
  entries,
  onSeek,
}: {
  currentMs: number;
  durationMs: number;
  entries: TimelineEntry[];
  onSeek: (ms: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const progressPct = durationMs > 0 ? clamp((currentMs / durationMs) * 100, 0, 100) : 0;
  const visibleEntries = entries.filter((entry) => VISIBLE_TIMELINE_KINDS.has(entry.type));

  // Only show legend chips for kinds that actually have positioned dots, so the
  // legend mirrors the track exactly (no phantom "network" when none recorded,
  // no missing kinds when they are).
  const legendKinds = TIMELINE_KIND_META.filter((meta) =>
    visibleEntries.some((entry) => entry.type === meta.kind && entry.offsetMs != null),
  );

  function seekFromClientX(clientX: number) {
    const track = trackRef.current;
    if (!track) return;
    const { left, width } = track.getBoundingClientRect();
    const pct = clamp((clientX - left) / width, 0, 1);
    onSeek(pct * durationMs);
  }

  function handleTrackPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    seekFromClientX(event.clientX);
    const handleMove = (e: PointerEvent) => seekFromClientX(e.clientX);
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
  }

  return (
    <div className="mt-3">
      <div
        ref={trackRef}
        role="slider"
        aria-label="Video timeline scrubber"
        aria-valuemin={0}
        aria-valuemax={durationMs}
        aria-valuenow={currentMs}
        tabIndex={0}
        className="relative h-8 cursor-pointer select-none rounded-md bg-[var(--primary-subtle)]"
        onPointerDown={handleTrackPointerDown}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') onSeek(Math.max(0, currentMs - 5000));
          if (event.key === 'ArrowRight') onSeek(Math.min(durationMs, currentMs + 5000));
        }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-md bg-[var(--primary-soft)]"
          style={{ width: `${progressPct}%` }}
        />
        {/* Dots are inset 0.6%→99.4% so events at t=0 or t=duration don't half-
            overflow the rounded track edges. */}
        {visibleEntries.map((entry) => {
          if (entry.offsetMs == null || durationMs <= 0) return null;
          const pct = 0.6 + clamp((entry.offsetMs / durationMs) * 100, 0, 100) * 0.988;
          const color = timelineEventColors[entry.type] ?? 'var(--ink-faint)';
          return (
            <button
              key={`${entry.type}-${entry.id}`}
              type="button"
              aria-label={`${entry.type}: ${entry.title} at ${formatOffset(entry.offsetMs)}`}
              onClick={(event) => {
                event.stopPropagation();
                onSeek(entry.offsetMs!);
              }}
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-[var(--bg)] transition-transform hover:scale-150"
              style={{ left: `${pct}%`, backgroundColor: color }}
            />
          );
        })}
        <div
          className="pointer-events-none absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--ink)]"
          style={{ left: `${progressPct}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 px-0.5 font-mono text-[10px] text-[var(--ink-faint)]">
        <span className="shrink-0">{formatOffset(currentMs)}</span>
        {/* Legend is derived from the kinds that ACTUALLY have dots on the track,
            using the same color source — so it always matches what's shown. */}
        <span className="scrollbar-none flex min-w-0 items-center gap-x-3 gap-y-1 overflow-x-auto">
          {legendKinds.length > 0 ? (
            legendKinds.map((meta) => (
              <span key={meta.kind} className="inline-flex shrink-0 items-center gap-1">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
                {meta.label}
              </span>
            ))
          ) : (
            <span className="text-[var(--ink-faint)]">no timeline events</span>
          )}
        </span>
        <span className="shrink-0">{formatOffset(durationMs)}</span>
      </div>
    </div>
  );
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
