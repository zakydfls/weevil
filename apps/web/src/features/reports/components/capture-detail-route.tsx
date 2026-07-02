'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth/auth-context';
import { usePublicReportDetail, useReportDetail } from '../queries';
import { CaptureDetailView } from './capture-detail-view';

type CaptureDetailRouteProps =
  | { id: string; shareToken?: never }
  | { id?: never; shareToken: string };

export function CaptureDetailRoute({ id, shareToken }: CaptureDetailRouteProps) {
  const router = useRouter();
  const auth = useAuth();
  const isPublicShare = Boolean(shareToken);
  const privateDetailQuery = useReportDetail(id ?? null);
  const publicDetailQuery = usePublicReportDetail(shareToken ?? null);
  const detailQuery = isPublicShare ? publicDetailQuery : privateDetailQuery;
  const canComment = isPublicShare
    ? auth.status === 'authenticated' && auth.workspace?.id === detailQuery.data?.workspaceId
    : true;

  function handleBack() {
    if (isPublicShare) {
      if (window.history.length > 1) {
        router.back();
        return;
      }
      router.push('/login');
      return;
    }

    // Prefer real back nav (preserves list scroll/filters); fall back to /captures.
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/captures');
  }

  return (
    <CaptureDetailView
      report={detailQuery.data}
      isLoading={detailQuery.isLoading}
      isError={detailQuery.isError}
      onRetry={() => void detailQuery.refetch()}
      onBack={handleBack}
      isPublicShare={isPublicShare}
      publicShareToken={shareToken}
      canComment={canComment}
      commentGateReason={auth.status === 'authenticated' ? 'workspace' : 'auth'}
      authReturnPath={shareToken ? `/c/share/${encodeURIComponent(shareToken)}` : undefined}
    />
  );
}
