'use client';

import { useRouter } from 'next/navigation';
import type { ReportSummary } from '@/lib/api/types';
import { useReports } from './queries';
import { KanbanBoard } from './components/kanban-board';

export function BoardView() {
  const router = useRouter();
  // The board needs the full set in one go (drag across columns), so we pull a
  // large page rather than paginating.
  const reportsQuery = useReports({ page: 1, pageSize: 100 });
  const reports = reportsQuery.data?.items ?? [];

  function openCapture(report: ReportSummary) {
    router.push(`/c/${report.id}`);
  }

  return (
    <KanbanBoard
      reports={reports}
      isLoading={reportsQuery.isLoading}
      isError={reportsQuery.isError}
      onRetry={() => void reportsQuery.refetch()}
      onOpenReport={openCapture}
    />
  );
}
