'use client';

import { useRouter } from 'next/navigation';
import { useReportDetail } from '../queries';
import { CaptureDetailView } from './capture-detail-view';

export function CaptureDetailRoute({ id }: { id: string }) {
  const router = useRouter();
  const detailQuery = useReportDetail(id);

  function handleBack() {
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
      onBack={handleBack}
    />
  );
}
