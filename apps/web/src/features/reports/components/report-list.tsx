'use client';

import { Filter, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/utils';
import type { ReportSummary } from '@/lib/api/types';
import { StatusBadge } from './status-badge';

interface ReportListProps {
  reports: ReportSummary[];
  selectedReportId: string | null;
  isLoading: boolean;
  isRefetching: boolean;
  onRefresh: () => void;
  onSelect: (reportId: string) => void;
}

export function ReportList({
  reports,
  selectedReportId,
  isLoading,
  isRefetching,
  onRefresh,
  onSelect,
}: ReportListProps) {
  return (
    <section className="min-h-0 bg-[#fbfcfd]">
      <div className="flex h-12 items-center justify-between border-b border-[var(--border)] bg-white px-4">
        <h2 className="text-sm font-semibold">Reports</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          disabled={isRefetching}
          title="Refresh reports"
          aria-label="Refresh reports"
        >
          <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} aria-hidden />
        </Button>
      </div>
      <div className="grid gap-2 border-b border-[var(--border)] bg-white p-3">
        <Input className="h-8" placeholder="Filter current list" />
        <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
          <Filter className="h-3.5 w-3.5" aria-hidden />
          Server-paginated reports
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-16 animate-pulse rounded-md border border-[var(--border)] bg-[var(--muted)]"
            />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No reports" description="Create a report to start testing the flow." />
        </div>
      ) : (
        <div className="thin-scrollbar max-h-[calc(100vh-17rem)] overflow-auto p-2">
          {reports.map((report) => (
            <button
              key={report.id}
              type="button"
              onClick={() => onSelect(report.id)}
              className={`mb-2 grid w-full gap-2 rounded-md border p-3 text-left shadow-[0_1px_1px_rgba(16,24,40,0.03)] transition-colors ${
                selectedReportId === report.id
                  ? 'border-[#8dd7cd] bg-[#f0fbf9]'
                  : 'border-[var(--border)] bg-white hover:bg-[var(--surface-subtle)]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="line-clamp-2 text-sm font-medium">{report.title}</span>
                <StatusBadge status={report.status} />
              </div>
              <div className="truncate text-xs text-[var(--muted-foreground)]">
                {report.pageUrl ?? report.id}
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                {formatDate(report.createdAt)}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
