import { Badge } from '@/components/ui/badge';
import { reportStatusTone } from '../report-status';

const userVisibleReportStatuses = new Set(['READY', 'FAILED', 'ARCHIVED']);

export function isUserVisibleReportStatus(status: string) {
  return userVisibleReportStatuses.has(status);
}

export function StatusBadge({ status }: { status: string }) {
  if (!isUserVisibleReportStatus(status)) {
    return null;
  }

  return <Badge tone={reportStatusTone(status)}>{status}</Badge>;
}
