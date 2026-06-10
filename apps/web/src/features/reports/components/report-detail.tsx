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
import { EmptyState } from '@/components/ui/empty-state';
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
      <section className="thin-scrollbar min-h-0 overflow-auto bg-[var(--background)] p-3 sm:p-4">
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-[0_12px_40px_rgba(16,24,40,0.07)]">
          <div className="border-b border-[var(--border)] p-4">
            <div className="h-6 w-40 animate-pulse rounded bg-[var(--muted)]" />
            <div className="mt-4 h-8 w-2/3 animate-pulse rounded bg-[var(--muted)]" />
          </div>
          <div className="grid gap-4 bg-[#fafbfc] p-4 xl:grid-cols-[minmax(0,1.25fr)_28rem]">
            <div className="aspect-video animate-pulse rounded-lg bg-[#111318]" />
            <div className="min-h-80 animate-pulse rounded-lg bg-[var(--muted)]" />
          </div>
        </div>
      </section>
    );
  }

  if (!report) {
    return (
      <section className="thin-scrollbar min-h-0 overflow-auto bg-[var(--background)] p-3 sm:p-4">
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-white p-12">
          <EmptyState title="Select a report" description="The recording and diagnostics viewer will appear here." />
        </div>
      </section>
    );
  }

  return (
    <section className="thin-scrollbar min-h-0 overflow-auto bg-[var(--background)] p-3 sm:p-4">
      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-[0_12px_40px_rgba(16,24,40,0.07)]">
        <header className="flex flex-col gap-4 border-b border-[var(--border)] bg-white p-4 lg:flex-row lg:items-start lg:justify-between">
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

        <div className="grid gap-4 border-b border-[var(--border)] bg-[#fafbfc] p-4 xl:grid-cols-[minmax(0,1.25fr)_28rem]">
          <RecordingPreview report={report} seekOffsetMs={selectedOffsetMs} />
          <SynchronizedTimeline report={report} onSeek={setSelectedOffsetMs} />
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)] bg-white px-3 py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`h-8 rounded-md px-3 text-sm font-medium ${
                activeTab === tab.id
                  ? 'bg-[#111318] text-white'
                  : 'text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="bg-white p-4">
          {activeTab === 'overview' ? <OverviewTab report={report} /> : null}
          {activeTab === 'uploads' ? (
            <UploadsTab report={report} onDownload={(uploadId) => downloadUpload.mutate({ reportId: report.id, uploadId })} />
          ) : null}
          {activeTab === 'console' ? <ConsoleTab report={report} /> : null}
          {activeTab === 'network' ? <NetworkTab report={report} /> : null}
          {activeTab === 'events' ? <EventsTab report={report} /> : null}
        </div>
      </div>
    </section>
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
    <div className="overflow-hidden rounded-lg border border-[#1f2937] bg-[#0f141b] shadow-[0_14px_35px_rgba(15,20,27,0.18)]">
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
      <div className="grid aspect-video place-items-center bg-[radial-gradient(circle_at_center,#1f2937,#050608_62%)]">
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
        <div className="bg-[#151b23] p-3">
          <div className="text-white/50">Upload</div>
          <div className="mt-1 truncate">{primaryUpload?.status ?? 'n/a'}</div>
        </div>
        <div className="bg-[#151b23] p-3">
          <div className="text-white/50">Type</div>
          <div className="mt-1 truncate">{primaryUpload?.contentType ?? 'n/a'}</div>
        </div>
        <div className="bg-[#151b23] p-3">
          <div className="text-white/50">Size</div>
          <div className="mt-1 truncate">{formatBytes(primaryUpload?.byteSize)}</div>
        </div>
      </div>
    </div>
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
        {error ? <div className="text-xs text-[#ffb4ab]">{error}</div> : null}
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
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex h-10 items-center justify-between border-b border-[var(--border)] px-3">
        <div className="text-sm font-medium">Timeline</div>
        <div className="text-xs text-[var(--muted-foreground)]">{entries.length} entries</div>
      </div>
      <div className="thin-scrollbar max-h-[28rem] overflow-auto p-3">
        {entries.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--muted-foreground)]">
            No telemetry entries yet.
          </div>
        ) : (
          <div className="grid gap-2">
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSeek(entry.offsetMs ?? 0)}
                className="grid w-full grid-cols-[4.5rem_1fr] gap-3 rounded-md border border-[var(--border)] bg-white p-2 text-left transition-colors hover:border-[#8dd7cd] hover:bg-[#f0fbf9]"
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
            ))}
          </div>
        )}
      </div>
    </div>
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
        <div key={label} className="rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
          <div className="text-xs font-medium text-[var(--muted-foreground)]">{label}</div>
          <div className="mt-1 break-words text-sm">{value}</div>
        </div>
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
    <div className="overflow-hidden rounded-md border border-[var(--border)]">
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
    </div>
  );
}

function ConsoleTab({ report }: { report: ReportDetailType }) {
  if (report.consoleLogs.length === 0) {
    return <EmptyState title="No console logs" description="Console telemetry is empty." />;
  }

  return (
    <div className="grid gap-2">
      {report.consoleLogs.map((entry) => (
        <div key={entry.id} className="rounded-md border border-[var(--border)] bg-[#111418] p-3 text-sm text-white">
          <div className="flex items-center gap-2 text-xs text-[#a7b0bc]">
            <Terminal className="h-4 w-4" aria-hidden />
            <span>{entry.level}</span>
            <span>{formatDate(entry.timestamp)}</span>
          </div>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{entry.message}</pre>
        </div>
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
        <div key={entry.id} className="rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-sm">
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
        </div>
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
