import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/auth-context';
import { apiClient } from '@/lib/api/client';
import type { CreateReportInput, ListReportsParams } from '@/lib/api/types';

const NO_WORKSPACE_KEY = 'no-workspace';

export const reportKeys = {
  all: ['reports'] as const,
  lists: () => ['reports', 'list'] as const,
  list: (workspaceSlug: string, params: ListReportsParams) =>
    ['reports', 'list', workspaceSlug, params] as const,
  detail: (reportId: string) => ['reports', 'detail', reportId] as const,
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

export function useCreateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateReportInput) => apiClient.createReport(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: reportKeys.all });
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
