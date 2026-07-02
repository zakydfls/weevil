'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Download,
  Network,
  Play,
  Terminal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatBytes, formatDate } from '@/lib/utils';
import type { ReportDetail as ReportDetailType, TimelineEntry } from '@/lib/api/types';
import { useDownloadUpload } from '../queries';
import { StatusBadge } from './status-badge';

type DetailTab = 'overview' | 'uploads' | 'console' | 'network' | 'events';

const tabs: Array<{ id: DetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'uploads', label: 'Uploads' },
  { id: 'console', label: 'Console' },
  { id: 'network', label: 'Network' },
  { id: 'events', label: 'Events' },
];

interface ReportDetailProps {
  report: ReportDetailType | undefined;
  isLoading: boolean;
}

export function ReportDetail({ report, isLoading }: ReportDetailProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [selectedOffsetMs, setSelectedOffsetMs] = useState<number | null>(null);
  const downloadUpload = useDownloadUpload();

  if (isLoading) {
    return (
      <ScrollArea className="min-h-0 bg-[var(--background)] p-3 sm:p-4">
        <Card className="overflow-hidden bg-[var(--bg)]">
          <div className="border-b border-[var(--border)] p-4">
            <div className="h-6 w-40 animate-pulse rounded bg-[var(--muted)]" />
            <div className="mt-4 h-8 w-2/3 animate-pulse rounded bg-[var(--muted)]" />
          </div>
          <div className="grid gap-4 bg-[var(--surface)] p-4 xl:grid-cols-[minmax(0,1.25fr)_28rem]">
            <div className="aspect-video animate-pulse rounded-lg bg-[#1a1d12]" />
            <div className="min-h-80 animate-pulse rounded-lg bg-[var(--muted)]" />
          </div>
        </Card>
      </ScrollArea>
    );
  }

  if (!report) {
    return (
      <ScrollArea className="min-h-0 bg-[var(--background)] p-3 sm:p-4">
        <Card className="border-dashed bg-[var(--bg)]">
          <CardContent className="p-12">
          <EmptyState title="Select a report" description="The recording and diagnostics viewer will appear here." />
          </CardContent>
        </Card>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="min-h-0 bg-[var(--background)] p-3 sm:p-4">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as DetailTab)}>
      <Card className="overflow-hidden bg-[var(--bg)]">
        <header className="flex flex-col gap-4 border-b border-[var(--border)] bg-[var(--bg)] p-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={report.status} />
              <span className="rounded-md bg-[var(--muted)] px-2 py-1 text-xs text-[var(--muted-foreground)]">
                {report.id}
              </span>
            </div>
            <h2 className="mt-3 break-words text-2xl font-semibold tracking-normal">{report.title}</h2>
            {report.description ? (
              <p className="mt-2 max-w-3xl text-sm text-[var(--muted-foreground)]">
                {report.description}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {report.uploads[0] ? (
              <Button
                type="button"
                onClick={() =>
                  downloadUpload.mutate({ reportId: report.id, uploadId: report.uploads[0].id })
                }
                disabled={downloadUpload.isPending}
              >
                <Download className="h-4 w-4" aria-hidden />
                Download
              </Button>
            ) : null}
          </div>
        </header>

        <div className="grid gap-4 border-b border-[var(--border)] bg-[var(--surface)] p-4 xl:grid-cols-[minmax(0,1.25fr)_28rem]">
          <RecordingPreview report={report} seekOffsetMs={selectedOffsetMs} />
          <SynchronizedTimeline report={report} onSeek={setSelectedOffsetMs} />
        </div>

        <TabsList className="scrollbar-none flex h-auto justify-start gap-1 overflow-x-auto rounded-none border-x-0 border-t-0 bg-[var(--bg)] px-3 py-2">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="h-8 px-3"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="bg-[var(--bg)] p-4">
          <TabsContent value="overview" className="mt-0"><OverviewTab report={report} /></TabsContent>
          <TabsContent value="uploads" className="mt-0">
            <UploadsTab report={report} onDownload={(uploadId) => downloadUpload.mutate({ reportId: report.id, uploadId })} />
          </TabsContent>
          <TabsContent value="console" className="mt-0"><ConsoleTab report={report} /></TabsContent>
          <TabsContent value="network" className="mt-0"><NetworkTab report={report} /></TabsContent>
          <TabsContent value="events" className="mt-0"><EventsTab report={report} /></TabsContent>
        </div>
      </Card>
      </Tabs>
    </ScrollArea>
  );
}

function RecordingPreview({
  report,
  seekOffsetMs,
}: {
  report: ReportDetailType;
  seekOffsetMs: number | null;
}) {
  const primaryUpload = report.uploads.find((upload) => upload.kind === 'SCREEN_RECORDING');
  const downloadUpload = useDownloadUpload();

  return (
    <Card className="overflow-hidden border-[var(--ink-strong)] bg-[var(--ink-strong)] text-white">
      <div className="flex h-10 items-center justify-between border-b border-white/10 px-3 text-white">
        <div>
          <div className="text-sm font-medium">Replay</div>
        </div>
        {primaryUpload ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => downloadUpload.mutate({ reportId: report.id, uploadId: primaryUpload.id })}
          >
            <Download className="h-4 w-4" aria-hidden />
            Open
          </Button>
        ) : null}
      </div>
      <div className="grid aspect-video place-items-center bg-[radial-gradient(circle_at_center,#3a3d31,#0a0c05_62%)]">
        {primaryUpload ? (
          <RecordingPlayer
            reportId={report.id}
            uploadId={primaryUpload.id}
            seekOffsetMs={seekOffsetMs}
          />
        ) : (
          <div className="px-6 text-center text-sm text-white/62">
            No recording artifact has been uploaded for this report.
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-px bg-white/10 text-xs text-white">
        <div className="bg-[#27291d] p-3">
          <div className="text-white/50">Upload</div>
          <div className="mt-1 truncate">{primaryUpload?.status ?? 'n/a'}</div>
        </div>
        <div className="bg-[#27291d] p-3">
          <div className="text-white/50">Type</div>
          <div className="mt-1 truncate">{primaryUpload?.contentType ?? 'n/a'}</div>
        </div>
        <div className="bg-[#27291d] p-3">
          <div className="text-white/50">Size</div>
          <div className="mt-1 truncate">{formatBytes(primaryUpload?.byteSize)}</div>
        </div>
      </div>
    </Card>
  );
}

function RecordingPlayer({
  reportId,
  uploadId,
  seekOffsetMs,
}: {
  reportId: string;
  uploadId: string;
  seekOffsetMs: number | null;
}) {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (seekOffsetMs === null || !videoRef.current) {
      return;
    }

    videoRef.current.currentTime = Math.max(0, seekOffsetMs / 1000);
  }, [seekOffsetMs]);

  async function loadSource() {
    try {
      setError(null);
      const { apiClient } = await import('@/lib/api/client');
      const response = await apiClient.getDownloadUrl(reportId, uploadId);
      setSourceUrl(response.getUrl);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load recording');
    }
  }

  if (!sourceUrl) {
    return (
      <div className="grid gap-3 text-center">
        <Button type="button" onClick={() => void loadSource()}>
          <Play className="h-4 w-4" aria-hidden />
          Load Recording
        </Button>
        {error ? <div className="text-xs text-[#fecdd3]">{error}</div> : null}
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      className="h-full w-full"
      controls
      src={sourceUrl}
      onError={() => setError('Browser cannot preview this artifact; use Open instead.')}
    />
  );
}

function SynchronizedTimeline({
  report,
  onSeek,
}: {
  report: ReportDetailType;
  onSeek: (offsetMs: number) => void;
}) {
  const entries = buildTimelineEntries(report);

  return (
    <Card className="overflow-hidden bg-[var(--bg)]">
      <div className="flex h-10 items-center justify-between border-b border-[var(--border)] px-3">
        <div className="text-sm font-medium">Timeline</div>
        <div className="text-xs text-[var(--muted-foreground)]">{entries.length} entries</div>
      </div>
      <ScrollArea className="max-h-[28rem] p-3">
        {entries.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--muted-foreground)]">
            No telemetry entries yet.
          </div>
        ) : (
          <div className="grid gap-2">
            {entries.map((entry) => (
              <Card
                asChild
                key={entry.id}
                className="grid w-full grid-cols-[4.5rem_1fr] gap-3 rounded-md bg-[var(--bg)] p-2 text-left transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-subtle)]"
              >
                <button
                  type="button"
                  onClick={() => onSeek(entry.offsetMs ?? 0)}
                >
                <div className="text-xs font-medium text-[var(--muted-foreground)]">
                  {formatOffset(entry.offsetMs)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <TimelineKindIcon kind={entry.type} severity={entry.severity} />
                    <div className="truncate text-sm font-medium">{entry.title}</div>
                  </div>
                  {entry.subtitle ? (
                    <div className="mt-1 truncate text-xs text-[var(--muted-foreground)]">
                      {entry.subtitle}
                    </div>
                  ) : null}
                </div>
                </button>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}

function OverviewTab({ report }: { report: ReportDetailType }) {
  const metrics = [
    ['Created', formatDate(report.createdAt)],
    ['Updated', formatDate(report.updatedAt)],
    ['Page', report.pageUrl ?? 'n/a'],
    ['Browser', [report.browserName, report.browserVersion].filter(Boolean).join(' ') || 'n/a'],
    ['OS', report.osName ?? 'n/a'],
    ['Viewport', report.viewportWidth && report.viewportHeight ? `${report.viewportWidth} x ${report.viewportHeight}` : 'n/a'],
    ['Uploads', String(report.uploads.length)],
    ['Console', String(report.consoleLogs.length)],
    ['Network', String(report.networkRequests.length)],
  ];

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {metrics.map(([label, value]) => (
        <Card key={label} className="rounded-md bg-[var(--surface)]">
          <CardContent className="p-3">
          <div className="text-xs font-medium text-[var(--muted-foreground)]">{label}</div>
          <div className="mt-1 break-words text-sm">{value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function UploadsTab({
  report,
  onDownload,
}: {
  report: ReportDetailType;
  onDownload: (uploadId: string) => void;
}) {
  if (report.uploads.length === 0) {
    return <EmptyState title="No uploads" description="Run the flow to attach a recording artifact." />;
  }

  return (
    <Card className="overflow-hidden rounded-md bg-[var(--bg)]">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-[var(--surface-subtle)] text-left text-xs text-[var(--muted-foreground)]">
          <tr>
            <th className="px-3 py-2 font-medium">Kind</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Size</th>
            <th className="px-3 py-2 font-medium">Created</th>
            <th className="w-12 px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {report.uploads.map((upload) => (
            <tr key={upload.id} className="border-t border-[var(--border)]">
              <td className="px-3 py-2">{upload.kind}</td>
              <td className="px-3 py-2">{upload.status}</td>
              <td className="px-3 py-2">{formatBytes(upload.byteSize)}</td>
              <td className="px-3 py-2 text-[var(--muted-foreground)]">{formatDate(upload.createdAt)}</td>
              <td className="px-3 py-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onDownload(upload.id)}
                  title="Download artifact"
                  aria-label="Download artifact"
                >
                  <Download className="h-4 w-4" aria-hidden />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function ConsoleTab({ report }: { report: ReportDetailType }) {
  if (report.consoleLogs.length === 0) {
    return <EmptyState title="No console logs" description="Console telemetry is empty." />;
  }

  return (
    <div className="grid gap-2">
      {report.consoleLogs.map((entry) => (
        <Card key={entry.id} className="rounded-md border-[var(--ink-strong)] bg-[var(--ink-strong)] p-3 text-sm text-white">
          <div className="flex items-center gap-2 text-xs text-white/55">
            <Terminal className="h-4 w-4" aria-hidden />
            <span>{entry.level}</span>
            <span>{formatDate(entry.timestamp)}</span>
          </div>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{entry.message}</pre>
        </Card>
      ))}
    </div>
  );
}

function NetworkTab({ report }: { report: ReportDetailType }) {
  if (report.networkRequests.length === 0) {
    return <EmptyState title="No network requests" description="Network telemetry is empty." />;
  }

  return (
    <div className="grid gap-2">
      {report.networkRequests.map((entry) => (
        <Card key={entry.id} className="rounded-md bg-[var(--surface)] p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Network className="h-4 w-4 text-[var(--muted-foreground)]" aria-hidden />
            <span className="font-medium">{entry.method}</span>
            <span className={entry.statusCode && entry.statusCode >= 400 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}>
              {entry.statusCode ?? 'n/a'}
            </span>
            <span className="text-[var(--muted-foreground)]">{entry.durationMs ?? 0}ms</span>
          </div>
          <div className="mt-2 break-all text-xs text-[var(--muted-foreground)]">{entry.url}</div>
          {entry.error ? <div className="mt-2 text-xs text-[var(--danger)]">{entry.error}</div> : null}
        </Card>
      ))}
    </div>
  );
}

function EventsTab({ report }: { report: ReportDetailType }) {
  return (
    <div className="grid gap-3">
      {report.events.map((event) => (
        <div key={event.id} className="grid grid-cols-[1.5rem_1fr] gap-3">
          <EventIcon kind={event.kind} />
          <div className="border-b border-[var(--border)] pb-3">
            <div className="text-sm font-medium">{event.kind}</div>
            <div className="mt-1 text-xs text-[var(--muted-foreground)]">{formatDate(event.createdAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function buildTimelineEntries(report: ReportDetailType): TimelineEntry[] {
  const start = new Date(report.createdAt).getTime();
  const entries: TimelineEntry[] = [
    ...report.consoleLogs.map((entry) => ({
      id: `console-${entry.id}`,
      type: 'CONSOLE' as const,
      severity: entry.level === 'ERROR' ? ('danger' as const) : ('warning' as const),
      title: `${entry.level}: ${entry.message}`,
      subtitle: entry.stack ?? undefined,
      timestamp: entry.timestamp,
      offsetMs: new Date(entry.timestamp).getTime() - start,
    })),
    ...report.networkRequests.map((entry) => ({
      id: `network-${entry.id}`,
      type: 'NETWORK' as const,
      severity:
        entry.statusCode && entry.statusCode >= 400 ? ('danger' as const) : ('success' as const),
      title: `${entry.method} ${entry.statusCode ?? 'n/a'}`,
      subtitle: entry.url,
      timestamp: entry.startedAt,
      offsetMs: new Date(entry.startedAt).getTime() - start,
    })),
    ...report.events.map((entry) => ({
      id: `event-${entry.id}`,
      type: 'EVENT' as const,
      severity: entry.kind.includes('FAILED')
        ? ('danger' as const)
        : entry.kind.includes('COMPLETED')
          ? ('success' as const)
          : ('info' as const),
      title: entry.kind,
      timestamp: entry.createdAt,
      offsetMs: new Date(entry.createdAt).getTime() - start,
    })),
  ];

  return entries.sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
}

function formatOffset(offsetMs: number | null | undefined) {
  if (offsetMs === null || offsetMs === undefined || !Number.isFinite(offsetMs)) {
    return 'n/a';
  }

  const normalizedOffset = Math.max(0, offsetMs);
  const seconds = Math.floor(normalizedOffset / 1000);
  const minutes = Math.floor(seconds / 60);

  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function TimelineKindIcon({
  kind,
  severity,
}: {
  kind: TimelineEntry['type'];
  severity: 'neutral' | 'info' | 'warning' | 'danger' | 'success';
}) {
  const colorClass =
    severity === 'danger'
      ? 'text-[var(--danger)]'
      : severity === 'success'
        ? 'text-[var(--success)]'
        : severity === 'warning'
          ? 'text-[var(--warning)]'
          : 'text-[var(--primary)]';

  if (kind === 'CONSOLE' || kind === 'ERROR') {
    return <Terminal className={`h-4 w-4 ${colorClass}`} aria-hidden />;
  }

  if (kind === 'NETWORK' || kind === 'BACKEND') {
    return <Network className={`h-4 w-4 ${colorClass}`} aria-hidden />;
  }

  return <Clock3 className={`h-4 w-4 ${colorClass}`} aria-hidden />;
}

function EventIcon({ kind }: { kind: string }) {
  if (kind.includes('FAILED')) {
    return <AlertCircle className="mt-0.5 h-5 w-5 text-[var(--danger)]" aria-hidden />;
  }

  if (kind.includes('COMPLETED')) {
    return <CheckCircle2 className="mt-0.5 h-5 w-5 text-[var(--success)]" aria-hidden />;
  }

  return <Clock3 className="mt-0.5 h-5 w-5 text-[var(--muted-foreground)]" aria-hidden />;
}
