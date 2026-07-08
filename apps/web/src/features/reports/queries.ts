import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/auth-context';
import { apiClient } from '@/lib/api/client';
import type {
  CreateReportBoardColumnInput,
  CreateReportInput,
  ListReportsParams,
  PaginatedReportsResponse,
  UpdateReportAssigneesInput,
  UpdateReportBoardColumnInput,
} from '@/lib/api/types';

const NO_WORKSPACE_KEY = 'no-workspace';

export const reportKeys = {
  all: ['reports'] as const,
  lists: () => ['reports', 'list'] as const,
  list: (workspaceSlug: string, params: ListReportsParams) =>
    ['reports', 'list', workspaceSlug, params] as const,
  boardColumns: (workspaceSlug: string) => ['reports', 'board-columns', workspaceSlug] as const,
  detail: (reportId: string) => ['reports', 'detail', reportId] as const,
  publicDetail: (shareToken: string) => ['reports', 'public-detail', shareToken] as const,
};

export function useReports(params: ListReportsParams) {
  const workspaceKey = useWorkspaceQueryKey();

  return useQuery({
    queryKey: reportKeys.list(workspaceKey, params),
    queryFn: () => apiClient.listReports(params),
    enabled: workspaceKey !== NO_WORKSPACE_KEY,
    placeholderData: (previousData, previousQuery) => {
      const previousWorkspaceKey = previousQuery?.queryKey[2];
      return previousWorkspaceKey === workspaceKey ? previousData : undefined;
    },
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
}

export function useReportDetail(reportId: string | null) {
  const workspaceKey = useWorkspaceQueryKey();

  return useQuery({
    queryKey: reportId ? reportKeys.detail(reportId) : ['reports', 'empty', workspaceKey],
    queryFn: () => apiClient.getReportDetail(reportId ?? ''),
    enabled: Boolean(reportId) && workspaceKey !== NO_WORKSPACE_KEY,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'PROCESSING' || status === 'UPLOADING' ? 2_000 : false;
    },
  });
}

export function usePublicReportDetail(shareToken: string | null) {
  return useQuery({
    queryKey: shareToken ? reportKeys.publicDetail(shareToken) : ['reports', 'public-empty'],
    queryFn: () => apiClient.getPublicReportDetail(shareToken ?? ''),
    enabled: Boolean(shareToken),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'PROCESSING' || status === 'UPLOADING' ? 2_000 : false;
    },
  });
}

export function useCreateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateReportInput) => apiClient.createReport(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: reportKeys.all });
    },
  });
}

export function useMoveReportOnBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      reportId,
      boardColumn,
      targetIndex,
    }: {
      reportId: string;
      boardColumn: string;
      targetIndex: number;
    }) => apiClient.moveReportOnBoard(reportId, { boardColumn, targetIndex }),
    onMutate: async ({ reportId, boardColumn, targetIndex }) => {
      await queryClient.cancelQueries({ queryKey: reportKeys.lists() });
      const previousLists = queryClient.getQueriesData<PaginatedReportsResponse>({
        queryKey: reportKeys.lists(),
      });

      queryClient.setQueriesData<PaginatedReportsResponse>(
        { queryKey: reportKeys.lists() },
        (current) => optimisticMoveReport(current, reportId, boardColumn, targetIndex),
      );

      return { previousLists };
    },
    onError: (_error, _variables, context) => {
      context?.previousLists.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: reportKeys.lists() });
    },
  });
}

export function useReportBoardColumns() {
  const workspaceKey = useWorkspaceQueryKey();

  return useQuery({
    queryKey: reportKeys.boardColumns(workspaceKey),
    queryFn: () => apiClient.listReportBoardColumns(),
    enabled: workspaceKey !== NO_WORKSPACE_KEY,
    staleTime: 60_000,
  });
}

export function useCreateReportBoardColumn() {
  const queryClient = useQueryClient();
  const workspaceKey = useWorkspaceQueryKey();

  return useMutation({
    mutationFn: (input: CreateReportBoardColumnInput) => apiClient.createReportBoardColumn(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: reportKeys.boardColumns(workspaceKey) });
    },
  });
}

export function useUpdateReportBoardColumn() {
  const queryClient = useQueryClient();
  const workspaceKey = useWorkspaceQueryKey();

  return useMutation({
    mutationFn: ({
      boardColumnId,
      input,
    }: {
      boardColumnId: string;
      input: UpdateReportBoardColumnInput;
    }) => apiClient.updateReportBoardColumn(boardColumnId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: reportKeys.boardColumns(workspaceKey) });
    },
  });
}

export function useDeleteReportBoardColumn() {
  const queryClient = useQueryClient();
  const workspaceKey = useWorkspaceQueryKey();

  return useMutation({
    mutationFn: (boardColumnId: string) => apiClient.deleteReportBoardColumn(boardColumnId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: reportKeys.boardColumns(workspaceKey) }),
        queryClient.invalidateQueries({ queryKey: reportKeys.lists() }),
      ]);
    },
  });
}

export function useUpdateReportAssignees() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      reportId,
      input,
    }: {
      reportId: string;
      input: UpdateReportAssigneesInput;
    }) => apiClient.updateReportAssignees(reportId, input),
    onSuccess: async (report) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: reportKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: reportKeys.detail(report.id) }),
        queryClient.invalidateQueries({ queryKey: reportKeys.publicDetail(report.shareToken) }),
      ]);
    },
  });
}

export function useDownloadUpload() {
  return useMutation({
    mutationFn: async ({ reportId, uploadId }: { reportId: string; uploadId: string }) => {
      const response = await apiClient.getDownloadUrl(reportId, uploadId);
      window.open(response.getUrl, '_blank', 'noopener,noreferrer');
    },
  });
}

function useWorkspaceQueryKey(): string {
  const auth = useAuth();
  return auth.workspace?.slug ?? NO_WORKSPACE_KEY;
}

function optimisticMoveReport(
  current: PaginatedReportsResponse | undefined,
  reportId: string,
  boardColumn: string,
  targetIndex: number,
): PaginatedReportsResponse | undefined {
  if (!current) return current;

  const moved = current.items.find((report) => report.id === reportId);
  if (!moved) return current;

  const nextItems = current.items.map((report) =>
    report.id === reportId
      ? {
          ...report,
          boardColumn,
          boardOrder: (targetIndex + 1) * 1000,
        }
      : report,
  );

  return {
    ...current,
    items: nextItems,
  };
}
