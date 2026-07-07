'use client';

import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { StatusBadge, isUserVisibleReportStatus } from './status-badge';
import { AssigneeAvatarStack } from './report-assignees';
import type { ReportReporter, ReportSummary } from '@/lib/api/types';
import { apiClient } from '@/lib/api/client';

const PREVIEW_LOAD_TIMEOUT_MS = 6500;
const previewUrlCache = new Map<string, string>();
const previewErrorCache = new Set<string>();

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
      <div className="grid items-start gap-5 sm:grid-cols-2 xl:grid-cols-3 xl:gap-6" role="status" aria-label="Loading captures">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card
            key={index}
            className="weevil-step-enter overflow-hidden bg-[var(--bg)]"
            style={{ animationDelay: `${index * 28}ms` }}
          >
            <div className="weevil-skeleton aspect-[16/9] border-b border-[var(--border)] bg-[var(--surface-deep)]" />
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="weevil-skeleton h-4 w-2/3 rounded bg-[var(--surface-deep)]" />
                  <div className="weevil-skeleton h-3 w-1/2 rounded bg-[var(--surface)]" />
                </div>
                <div className="weevil-skeleton h-3 w-9 shrink-0 rounded bg-[var(--surface)]" />
              </div>
              <div className="flex items-center gap-4 border-t border-[var(--divider)] pt-3">
                {Array.from({ length: 4 }).map((_, statIndex) => (
                  <div key={statIndex} className="weevil-skeleton h-3 w-8 rounded bg-[var(--surface)]" />
                ))}
              </div>
            </div>
          </Card>
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
    <div className="grid items-start gap-5 sm:grid-cols-2 xl:grid-cols-3 xl:gap-6">
      {reports.map((report, index) => {
        const reporter = reporterMeta(report.reporter);
        return (
          <Card
            asChild
            key={report.id}
            className="group weevil-soft-rise weevil-card-hover min-w-0 overflow-hidden bg-[var(--bg)] text-left transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_8px_-8px_rgba(26,29,18,0.24)] focus:outline-none focus-visible:border-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--primary-subtle)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
            style={{ animationDelay: `${Math.min(index, 8) * 22}ms` }}
          >
            <button
              type="button"
              onClick={() => onSelect(report)}
            >
            <div className="relative aspect-[16/9] overflow-hidden border-b border-[var(--border)] bg-[var(--surface)]">
              <CaptureThumbnail report={report} />
              {isUserVisibleReportStatus(report.status) ? (
                <div className="absolute left-3 top-3 z-10">
                  <StatusBadge status={report.status} />
                </div>
              ) : null}
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
                  <div className="mt-3 flex min-w-0 items-center gap-2.5 rounded-md bg-[var(--surface)] px-2.5 py-2">
                    <Avatar className="h-7 w-7 rounded-full ring-1 ring-[var(--primary-soft)]">
                      <AvatarFallback className="rounded-full bg-[var(--primary-subtle)] font-mono text-[10px] font-semibold uppercase text-[var(--primary)]">
                        {reporter.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                        Reported by
                      </div>
                      <div className="mt-0.5 truncate text-xs font-semibold text-[var(--ink)]">
                        {reporter.name}
                      </div>
                    </div>
                  </div>
                  {report.assignees.length > 0 ? (
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                        Assigned
                      </span>
                      <AssigneeAvatarStack assignees={report.assignees} />
                    </div>
                  ) : null}
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
          </Card>
        );
      })}
    </div>
  );
}

function reporterMeta(reporter: ReportReporter | null | undefined) {
  const name = reporter?.displayName?.trim() || reporter?.email || 'Unknown reporter';
  const initials = name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';

  return { name, initials };
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
  const [rootRef, shouldLoadPreview] = useInViewport<HTMLDivElement>('480px');
  const [hasLoadedPreview, setHasLoadedPreview] = useState(false);
  const recordingId = report.primaryRecording?.id;
  const previewKey = recordingId ? `${report.id}:${recordingId}` : null;
  const [sourceUrl, setSourceUrl] = useState<string | null>(() =>
    previewKey ? (previewUrlCache.get(previewKey) ?? null) : null,
  );
  const [isSourceLoading, setIsSourceLoading] = useState(false);

  useEffect(() => {
    setHasLoadedPreview(false);

    if (!recordingId || !previewKey) {
      setSourceUrl(null);
      setIsSourceLoading(false);
      return undefined;
    }

    const cachedUrl = previewUrlCache.get(previewKey);
    if (cachedUrl) {
      setSourceUrl(cachedUrl);
      setIsSourceLoading(false);
      return undefined;
    }

    if (!shouldLoadPreview || previewErrorCache.has(previewKey)) {
      setSourceUrl(null);
      setIsSourceLoading(false);
      return undefined;
    }

    let isMounted = true;
    const timeoutId = window.setTimeout(() => {
      if (!isMounted) return;
      setIsSourceLoading(false);
    }, PREVIEW_LOAD_TIMEOUT_MS);

    setIsSourceLoading(true);
    apiClient
      .getDownloadUrl(report.id, recordingId)
      .then((response) => {
        if (!isMounted) return;
        window.clearTimeout(timeoutId);
        previewUrlCache.set(previewKey, response.getUrl);
        setSourceUrl(response.getUrl);
        setIsSourceLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        window.clearTimeout(timeoutId);
        previewErrorCache.add(previewKey);
        setSourceUrl(null);
        setIsSourceLoading(false);
      });

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [previewKey, recordingId, report.id, shouldLoadPreview]);

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
    <div ref={rootRef} className="absolute inset-0">
      {!hasLoadedPreview ? (
        <div
          className={`absolute inset-0 bg-[var(--surface)] ${
            isSourceLoading ? 'weevil-skeleton' : ''
          }`}
        >
          <svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <defs>
              <pattern id={`grid-${report.id}`} width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="var(--border)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#grid-${report.id})`} />
          </svg>
        </div>
      ) : null}
      {sourceUrl ? (
        <video
          ref={videoRef}
          src={sourceUrl}
          muted
          playsInline
          preload={shouldLoadPreview ? 'metadata' : 'none'}
          onLoadedMetadata={handleLoadedMetadata}
          onLoadedData={() => setHasLoadedPreview(true)}
          onCanPlay={() => setHasLoadedPreview(true)}
          onSeeked={() => setHasLoadedPreview(true)}
          onError={() => {
            if (previewKey) {
              previewUrlCache.delete(previewKey);
              previewErrorCache.add(previewKey);
            }
            setHasLoadedPreview(false);
            setSourceUrl(null);
          }}
          className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-300 ${
            hasLoadedPreview ? 'opacity-100' : 'opacity-0'
          } group-hover:scale-[1.025]`}
        />
      ) : null}
      {!sourceUrl && !recordingId ? (
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
            no recording
          </span>
        </div>
      ) : null}
    </div>
  );
}

function useInViewport<T extends HTMLElement>(rootMargin = '320px') {
  const ref = useRef<T | null>(null);
  const [isInViewport, setIsInViewport] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || isInViewport) return undefined;
    if (!('IntersectionObserver' in window)) {
      setIsInViewport(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setIsInViewport(true);
        observer.disconnect();
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isInViewport, rootMargin]);

  return [ref, isInViewport] as const;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}
