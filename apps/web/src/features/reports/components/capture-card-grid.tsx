'use client';

import { useEffect, useRef, useState } from 'react';
import { MonitorPlay, Play } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import type { ReportSummary } from '@/lib/api/types';
import { apiClient } from '@/lib/api/client';

interface CaptureCardGridProps {
  reports: ReportSummary[];
  isLoading: boolean;
  onSelect: (report: ReportSummary) => void;
}

export function CaptureCardGrid({ reports, isLoading, onSelect }: CaptureCardGridProps) {
  if (isLoading) {
    return (
      <div className="grid gap-9 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-72 animate-pulse rounded-2xl bg-[#f0efed]" />
        ))}
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <EmptyState
        title="No captures yet"
        description="Create a capture to start collecting bug context."
      />
    );
  }

  return (
    <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 2xl:grid-cols-3">
      {reports.map((report, index) => (
        <button
          key={report.id}
          type="button"
          onClick={() => onSelect(report)}
          className="group weevil-soft-rise min-w-0 rounded-2xl text-left focus:outline-none focus:ring-2 focus:ring-[#2563eb]"
          style={{ animationDelay: `${Math.min(index, 8) * 22}ms` }}
        >
          <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-[#e8e6e1] shadow-[0_10px_28px_rgba(21,32,54,0.08)] ring-1 ring-black/5 transition duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_18px_44px_rgba(21,32,54,0.14)] group-hover:ring-[#bfdbfe]">
            <CaptureThumbnail report={report} fallbackClassName={previewGradient(index)} />
            <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/35 to-transparent" />
            <div className="absolute left-4 top-4 flex items-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/92 text-[#2563eb] shadow backdrop-blur">
                <MonitorPlay className="h-5 w-5" aria-hidden />
              </div>
              <div className="max-w-44 truncate rounded-lg bg-black/28 px-2.5 py-1 text-sm font-semibold text-white backdrop-blur drop-shadow">
                Capture
              </div>
            </div>
            <div className="absolute bottom-3 right-3 flex h-10 items-center gap-2 rounded-lg bg-black/52 px-3 text-white backdrop-blur transition group-hover:bg-black/65">
              <Play className="h-4 w-4 fill-white" aria-hidden />
              <span className="text-sm font-medium">
                {report.primaryRecording ? report.status : 'No video'}
              </span>
            </div>
          </div>
          <div className="mt-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold tracking-normal text-[#16213a]">
                {report.title}
              </h2>
              <p className="mt-1 truncate text-sm text-[#64708a]">
                {report.pageUrl ?? report.id}
              </p>
              <p className="mt-1 text-xs text-[#7a849d]">
                {report.consoleLogCount ?? 0} console · {report.networkRequestCount ?? 0} network ·{' '}
                {report.actionCount ?? 0} actions · {report.runtimeErrorCount ?? 0} errors
              </p>
            </div>
            <time className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-sm font-medium text-[#64708a] ring-1 ring-[#dfe5f5]">{shortDate(report.createdAt)}</time>
          </div>
        </button>
      ))}
    </div>
  );
}

function CaptureThumbnail({
  report,
  fallbackClassName,
}: {
  report: ReportSummary;
  fallbackClassName: string;
}) {
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
      <div className={`absolute inset-0 ${fallbackClassName}`} />
      <div className="absolute inset-6 rounded-xl border border-white/20 bg-white/20 backdrop-blur-[1px]" />
      {sourceUrl ? (
        <video
          ref={videoRef}
          src={sourceUrl}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onSeeked={() => setHasLoadedPreview(true)}
          onError={() => setSourceUrl(null)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            hasLoadedPreview ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : null}
      <div className="absolute inset-0 bg-black/12" />
      <MonitorPlay className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 text-white/82 drop-shadow" aria-hidden />
    </>
  );
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}

function previewGradient(index: number) {
  const gradients = [
    'bg-[linear-gradient(135deg,#0f766e,#e2e8f0_48%,#f8fafc)]',
    'bg-[linear-gradient(135deg,#6b7280,#f3f4f6_52%,#ffffff)]',
    'bg-[linear-gradient(135deg,#111827,#334155_45%,#e5e7eb)]',
    'bg-[linear-gradient(135deg,#115e59,#d1fae5_50%,#f8fafc)]',
  ];

  return gradients[index % gradients.length];
}
