'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Clock, Play, Wifi } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { apiClient } from '@/lib/api/client';
import type { ReportSummary } from '@/lib/api/types';
import { StatusBadge } from './status-badge';

const previewUrlCache = new Map<string, string>();
const previewErrorCache = new Set<string>();

interface InboxFeedProps {
  reports: ReportSummary[];
  isLoading: boolean;
  selectedReportId: string | null;
  onSelect: (report: ReportSummary) => void;
}

export function InboxFeed({ reports, isLoading, selectedReportId, onSelect }: InboxFeedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [keyboardIndex, setKeyboardIndex] = useState<number>(-1);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable) {
          return;
        }
      }
      if (event.key === 'j' || event.key === 'ArrowDown') {
        if (reports.length === 0) return;
        event.preventDefault();
        setKeyboardIndex((current) => {
          const next = Math.min(current + 1, reports.length - 1);
          scrollIntoView(containerRef.current, next);
          return next;
        });
      } else if (event.key === 'k' || event.key === 'ArrowUp') {
        if (reports.length === 0) return;
        event.preventDefault();
        setKeyboardIndex((current) => {
          const next = Math.max(current - 1, 0);
          scrollIntoView(containerRef.current, next);
          return next;
        });
      } else if (event.key === 'Enter' && keyboardIndex >= 0) {
        event.preventDefault();
        const report = reports[keyboardIndex];
        if (report) onSelect(report);
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [keyboardIndex, onSelect, reports]);

  if (isLoading) {
    return (
      <div className="divide-y divide-[var(--divider)] border-y border-[var(--border)]">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex h-20 animate-pulse items-center gap-4 px-4">
            <div className="h-14 w-24 rounded-md bg-[var(--surface)]" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 rounded bg-[var(--surface)]" />
              <div className="h-2.5 w-1/2 rounded bg-[var(--surface)]" />
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
    <div
      ref={containerRef}
      className="divide-y divide-[var(--divider)] border-y border-[var(--border)]"
      role="list"
    >
      {reports.map((report, index) => {
        const isSelected = report.id === selectedReportId;
        const isFocused = index === keyboardIndex;
        return (
          <button
            key={report.id}
            type="button"
            onClick={() => onSelect(report)}
            onMouseEnter={() => setKeyboardIndex(index)}
            className={`group grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 text-left transition-colors sm:px-6 ${
              isSelected
                ? 'bg-[var(--primary-subtle)]'
                : isFocused
                  ? 'bg-[var(--surface)]'
                  : 'bg-[var(--bg)] hover:bg-[var(--surface)]'
            }`}
            data-row-index={index}
          >
            <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] sm:w-28">
              <InboxThumbnail report={report} />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <StatusBadge status={report.status} />
                <h2 className="truncate text-sm font-semibold text-[var(--ink)]">{report.title}</h2>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-[var(--ink-faint)]">
                <span className="truncate">{report.pageUrl ?? report.id}</span>
                {(report.runtimeErrorCount ?? 0) > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[var(--danger)]">
                    <AlertTriangle className="h-3 w-3" aria-hidden />
                    {report.runtimeErrorCount} err
                  </span>
                ) : null}
                {(report.networkRequestCount ?? 0) > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Wifi className="h-3 w-3" aria-hidden />
                    {report.networkRequestCount} net
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1 text-right">
              <time className="font-mono text-xs text-[var(--ink-faint)]">
                {relativeTime(report.createdAt)}
              </time>
              {report.primaryRecording ? (
                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--ink-muted)]">
                  <Play className="h-2.5 w-2.5 fill-current" aria-hidden />
                  play
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--ink-faint)]">
                  <Clock className="h-2.5 w-2.5" aria-hidden />
                  no video
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function scrollIntoView(container: HTMLDivElement | null, index: number) {
  if (!container) return;
  const row = container.querySelector(`[data-row-index="${index}"]`);
  if (row instanceof HTMLElement) {
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function InboxThumbnail({ report }: { report: ReportSummary }) {
  const recordingId = report.primaryRecording?.id;
  const previewKey = recordingId ? `${report.id}:${recordingId}` : null;
  const [sourceUrl, setSourceUrl] = useState<string | null>(() =>
    previewKey ? (previewUrlCache.get(previewKey) ?? null) : null,
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasPreview, setHasPreview] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setHasPreview(false);

    if (!recordingId || !previewKey) {
      setSourceUrl(null);
      return undefined;
    }

    const cachedUrl = previewUrlCache.get(previewKey);
    if (cachedUrl) {
      setSourceUrl(cachedUrl);
      return undefined;
    }

    if (previewErrorCache.has(previewKey)) {
      setSourceUrl(null);
      return undefined;
    }

    apiClient
      .getDownloadUrl(report.id, recordingId)
      .then((response) => {
        if (!isMounted) return;
        previewUrlCache.set(previewKey, response.getUrl);
        setSourceUrl(response.getUrl);
      })
      .catch(() => {
        if (!isMounted) return;
        previewErrorCache.add(previewKey);
        setSourceUrl(null);
      });

    return () => {
      isMounted = false;
    };
  }, [previewKey, recordingId, report.id]);

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;
    const seekTo = Number.isFinite(video.duration) && video.duration > 0.5 ? 0.5 : 0.1;
    try {
      video.currentTime = seekTo;
    } catch {
      setHasPreview(true);
    }
  }

  return (
    <>
      {!hasPreview ? (
        <div className="absolute inset-0 grid place-items-center bg-[var(--surface)]">
          {!recordingId ? (
            <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
              no video
            </span>
          ) : null}
        </div>
      ) : null}
      {sourceUrl ? (
        <video
          ref={videoRef}
          src={sourceUrl}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onLoadedData={() => setHasPreview(true)}
          onCanPlay={() => setHasPreview(true)}
          onSeeked={() => setHasPreview(true)}
          onError={() => {
            if (previewKey) {
              previewUrlCache.delete(previewKey);
              previewErrorCache.add(previewKey);
            }
            setSourceUrl(null);
            setHasPreview(false);
          }}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${hasPreview ? 'opacity-100' : 'opacity-0'}`}
        />
      ) : null}
    </>
  );
}

function relativeTime(value: string) {
  const now = Date.now();
  const created = new Date(value).getTime();
  const diff = Math.max(0, now - created);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(new Date(value));
}
