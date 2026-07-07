'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth/auth-context';
import type { ReportSummary } from '@/lib/api/types';
import { useCreateReportBoardColumn, useMoveReportOnBoard, useReportBoardColumns, useReports } from './queries';
import { KanbanBoard } from './components/kanban-board';

export function BoardView() {
  const router = useRouter();
  const auth = useAuth();
  const moveReport = useMoveReportOnBoard();
  const createBoardColumn = useCreateReportBoardColumn();
  const boardColumnsQuery = useReportBoardColumns();
  // The board needs the full set in one go (drag across columns), so we pull a
  // large page rather than paginating.
  const reportsQuery = useReports({ page: 1, pageSize: 100 });
  const reports = reportsQuery.data?.items ?? [];
  // Cover every not-yet-settled state (see CapturesView) so the board shows a
  // skeleton, never an empty flash, on a slow/cold backend.
  const isLoadingBoard =
    reportsQuery.isPending || (reportsQuery.isFetching && reports.length === 0);

  function openCapture(report: ReportSummary) {
    router.push(`/c/${report.id}`);
  }

  function canEditAssignees(report: ReportSummary) {
    return (
      auth.can('REPORT_UPDATE_ANY') ||
      (auth.can('REPORT_UPDATE_OWN') && Boolean(report.reporter?.id && report.reporter.id === auth.user?.id))
    );
  }

  return (
    <KanbanBoard
      reports={reports}
      columns={boardColumnsQuery.data ?? []}
      isLoading={isLoadingBoard}
      areColumnsLoading={boardColumnsQuery.isPending}
      isError={reportsQuery.isError || boardColumnsQuery.isError}
      canManageBoardColumns={auth.can('BOARD_MANAGE')}
      onRetry={() => {
        void reportsQuery.refetch();
        void boardColumnsQuery.refetch();
      }}
      onOpenReport={openCapture}
      canEditAssignees={canEditAssignees}
      onCreateColumn={(input) => createBoardColumn.mutateAsync(input)}
      isCreatingColumn={createBoardColumn.isPending}
      onMoveReport={(reportId, toColumnId, toIndex) => {
        moveReport.mutate({ reportId, boardColumn: toColumnId, targetIndex: toIndex });
      }}
    />
  );
}
