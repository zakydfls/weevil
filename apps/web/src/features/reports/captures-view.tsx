'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ReportSummary } from '@/lib/api/types';
import { useReports } from './queries';
import { CaptureCardGrid } from './components/capture-card-grid';
import { PageHeader } from './components/page-chrome';

const PAGE_SIZE_OPTIONS = [12, 24, 48] as const;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debouncedValue;
}

export function CapturesView() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(12);
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  const params = useMemo(
    () => ({ page, pageSize, search: debouncedSearchTerm.trim() || undefined }),
    [debouncedSearchTerm, page, pageSize],
  );
  const reportsQuery = useReports(params);
  const reports = reportsQuery.data?.items ?? [];
  const totalItems = reportsQuery.data?.total ?? 0;
  const totalPages = reportsQuery.data?.totalPages ?? 1;

  useEffect(() => {
    setPage(1);
  }, [pageSize, debouncedSearchTerm]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  function openCapture(report: ReportSummary) {
    router.push(`/c/${report.id}`);
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-6xl flex-col">
      <PageHeader
        title="Captures"
        subtitle="Visual grid of every capture in this workspace."
        rightSlot={
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative w-full sm:w-72">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-faint)]"
                aria-hidden
              />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="h-9 pl-9 text-sm"
                placeholder="Filter by title or URL"
              />
            </div>
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-5 px-4 pb-10 sm:px-6">
        <CaptureCardGrid
          reports={reports}
          isLoading={reportsQuery.isLoading}
          isError={reportsQuery.isError}
          onRetry={() => void reportsQuery.refetch()}
          onSelect={openCapture}
        />
        {reportsQuery.isError && reports.length === 0 ? null : (
          <PaginationBar
            page={page}
            pageSize={pageSize}
            totalItems={totalItems}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>
    </div>
  );
}

function PaginationBar({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: (typeof PAGE_SIZE_OPTIONS)[number]) => void;
}) {
  if (totalItems <= pageSize && page === 1) {
    return (
      <div className="flex items-center justify-end pt-2 font-mono text-[11px] text-[var(--ink-faint)]">
        {totalItems} {totalItems === 1 ? 'capture' : 'captures'}
      </div>
    );
  }
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 pt-2 text-sm text-[var(--ink-muted)] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-1.5 font-mono text-xs">
        <span className="font-semibold text-[var(--ink)]">{start}-{end}</span>
        <span className="text-[var(--ink-faint)]">of {totalItems}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-1">
        <div className="mr-1 hidden items-center gap-0.5 border-r border-[var(--border)] pr-2 sm:flex">
          {PAGE_SIZE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onPageSizeChange(option)}
              className={`h-7 rounded-md px-2 font-mono text-xs font-semibold transition-colors ${
                option === pageSize
                  ? 'bg-[var(--bg)] text-[var(--primary)] shadow-[0_0_0_1px_var(--border)]'
                  : 'text-[var(--ink-muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]'
              }`}
              aria-pressed={option === pageSize}
            >
              {option}
            </button>
          ))}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-md"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <span className="px-1 font-mono text-xs text-[var(--ink-muted)]">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-md"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
