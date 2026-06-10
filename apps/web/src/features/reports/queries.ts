import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { CreateReportInput, ListReportsParams } from '@/lib/api/types';

export const reportKeys = {
  all: ['reports'] as const,
  list: (params: ListReportsParams) => ['reports', 'list', params] as const,
  detail: (reportId: string) => ['reports', reportId] as const,
};

export function useReports(params: ListReportsParams) {
  return useQuery({
    queryKey: reportKeys.list(params),
    queryFn: () => apiClient.listReports(params),
    placeholderData: (previousData) => previousData,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
}

export function useReportDetail(reportId: string | null) {
  return useQuery({
    queryKey: reportId ? reportKeys.detail(reportId) : ['reports', 'empty'],
    queryFn: () => apiClient.getReportDetail(reportId ?? ''),
    enabled: Boolean(reportId),
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
