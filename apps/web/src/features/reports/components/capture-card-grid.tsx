'use client';

import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { StatusBadge } from './status-badge';
import type { ReportSummary } from '@/lib/api/types';
import { apiClient } from '@/lib/api/client';

interface CaptureCardGridProps {
  reports: ReportSummary[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onSelect: (report: ReportSummary) => void;
}

export function CaptureCardGrid({ reports, isLoading, isError, onRetry, onSelect }: CaptureCardGridProps) {
  // Error takes priority over "empty" — a failed load must never look like an
  // empty workspace.
  if (isError && reports.length === 0) {
    return (
      <ErrorState
        title="Couldn’t load captures"
        description="We couldn’t reach the workspace. Check your connection and try again."
        onRetry={onRetry}
      />
    );
  }

  if (isLoading) {
    // Skeleton grid that mirrors the real cards, so the load reads as "content
    // arriving" (not an empty/placeholder message) and swaps in seamlessly.
    return (
      <div className="grid gap-6 sm:grid-cols-2 2xl:grid-cols-3" role="status" aria-label="Loading captures">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)]"
          >
            <div className="aspect-[16/9] animate-pulse border-b border-[var(--border)] bg-[var(--surface-deep)]" />
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--surface-deep)]" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--surface)]" />
                </div>
                <div className="h-3 w-9 shrink-0 animate-pulse rounded bg-[var(--surface)]" />
              </div>
              <div className="flex items-center gap-4 border-t border-[var(--divider)] pt-3">
                {Array.from({ length: 4 }).map((_, statIndex) => (
                  <div key={statIndex} className="h-3 w-8 animate-pulse rounded bg-[var(--surface)]" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <EmptyState
        title="No captures yet. Suspicious."
        description="Record a bug from the Weevil extension to drop the first capture here."
      />
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 2xl:grid-cols-3">
      {reports.map((report, index) => (
        <button
          key={report.id}
          type="button"
          onClick={() => onSelect(report)}
          className="group weevil-soft-rise weevil-card-hover min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] text-left transition-[border-color] duration-150 focus:outline-none focus-visible:border-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--primary-subtle)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          style={{ animationDelay: `${Math.min(index, 8) * 22}ms` }}
        >
          <div className="relative aspect-[16/9] overflow-hidden border-b border-[var(--border)] bg-[var(--surface)]">
            <CaptureThumbnail report={report} />
            {/* Status sits on its own chip, top-left, with a soft scrim so it
                reads over any captured content. */}
            <div className="absolute left-3 top-3 z-10">
              <StatusBadge status={report.status} />
            </div>
            {report.primaryRecording ? (
              /* Centered play only — never collides with widgets baked into the
                 captured frame's corners (e.g. the recorder HUD). Subtle by
                 default, lifts to the action color on hover. */
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--ink)]/55 text-white opacity-80 backdrop-blur-sm transition-[opacity,transform] duration-200 ease-out group-hover:scale-110 group-hover:bg-[var(--primary)] group-hover:opacity-100">
                  <Play className="h-5 w-5 translate-x-px fill-white" aria-hidden />
                </span>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold text-[var(--ink)]">
                  {report.title}
                </h2>
                <p className="mt-1 truncate font-mono text-xs text-[var(--ink-faint)]">
                  {report.pageUrl ?? report.id}
                </p>
              </div>
              <time className="shrink-0 font-mono text-xs text-[var(--ink-faint)]">
                {shortDate(report.createdAt)}
              </time>
            </div>
            <div className="flex items-center gap-3 border-t border-[var(--divider)] pt-3 font-mono text-[11px] text-[var(--ink-muted)]">
              <Stat label="cn" value={report.consoleLogCount ?? 0} />
              <Divider />
              <Stat label="net" value={report.networkRequestCount ?? 0} />
              <Divider />
              <Stat label="act" value={report.actionCount ?? 0} />
              <Divider />
              <Stat
                label="err"
                value={report.runtimeErrorCount ?? 0}
                tone={(report.runtimeErrorCount ?? 0) > 0 ? 'danger' : 'default'}
              />
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'danger';
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 ${
        tone === 'danger' ? 'text-[var(--danger)]' : 'text-[var(--ink-muted)]'
      }`}
    >
      <span className={tone === 'danger' ? 'font-semibold' : ''}>{value}</span>
      <span className="opacity-70">{label}</span>
    </span>
  );
}

function Divider() {
  return <span className="text-[var(--ink-faint)] opacity-50">·</span>;
}

function CaptureThumbnail({ report }: { report: ReportSummary }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [hasLoadedPreview, setHasLoadedPreview] = useState(false);
  const recordingId = report.primaryRecording?.id;

  useEffect(() => {
    let isMounted = true;

    async function loadThumbnail() {
      setHasLoadedPreview(false);
      setSourceUrl(null);

      if (!recordingId) {
        return;
      }

      try {
        const response = await apiClient.getDownloadUrl(report.id, recordingId);
        if (isMounted) {
          setSourceUrl(response.getUrl);
        }
      } catch {
        if (isMounted) {
          setSourceUrl(null);
        }
      }
    }

    void loadThumbnail();

    return () => {
      isMounted = false;
    };
  }, [recordingId, report.id]);

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const seekTo = Number.isFinite(video.duration) && video.duration > 0.5 ? 0.5 : 0.1;
    try {
      video.currentTime = seekTo;
    } catch {
      setHasLoadedPreview(true);
    }
  }

  return (
    <>
      {!hasLoadedPreview ? (
        <div className="absolute inset-0 bg-[var(--surface)]">
          <svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <defs>
              <pattern id={`grid-${report.id}`} width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="var(--border)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#grid-${report.id})`} />
          </svg>
          {recordingId ? (
            <div className="absolute inset-0 grid place-items-center">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                loading…
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
      {sourceUrl ? (
        <video
          ref={videoRef}
          src={sourceUrl}
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={handleLoadedMetadata}
          onLoadedData={() => setHasLoadedPreview(true)}
          onCanPlay={() => setHasLoadedPreview(true)}
          onSeeked={() => setHasLoadedPreview(true)}
          onError={() => setSourceUrl(null)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            hasLoadedPreview ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : null}
      {!sourceUrl && !recordingId ? (
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
            no recording
          </span>
        </div>
      ) : null}
    </>
  );
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}
