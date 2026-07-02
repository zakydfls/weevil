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
  const report = detailQuery.data;
  const canComment = isPublicShare
    ? auth.status === 'authenticated' && auth.workspace?.id === report?.workspaceId
    : true;
  const isWorkspaceMember =
    auth.status === 'authenticated' && Boolean(report) && auth.workspace?.id === report?.workspaceId;
  const isReporter = Boolean(report?.reporter?.id && report.reporter.id === auth.user?.id);
  const canEdit =
    isWorkspaceMember &&
    (auth.can('REPORT_UPDATE_ANY') || (auth.can('REPORT_UPDATE_OWN') && isReporter));
  const canDelete =
    isWorkspaceMember &&
    (auth.can('REPORT_DELETE_ANY') || (auth.can('REPORT_DELETE_OWN') && isReporter));

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
      report={report}
      isLoading={detailQuery.isLoading}
      isError={detailQuery.isError}
      onRetry={() => void detailQuery.refetch()}
      onBack={handleBack}
      isPublicShare={isPublicShare}
      publicShareToken={shareToken}
      canComment={canComment}
      commentGateReason={auth.status === 'authenticated' ? 'workspace' : 'auth'}
      authReturnPath={shareToken ? `/c/share/${encodeURIComponent(shareToken)}` : undefined}
      canEdit={canEdit}
      canDelete={canDelete}
      onDeleted={() => router.push('/captures')}
    />
  );
}
