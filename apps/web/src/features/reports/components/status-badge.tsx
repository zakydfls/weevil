import { Badge } from '@/components/ui/badge';
import { reportStatusTone } from '../report-status';

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={reportStatusTone(status)}>{status}</Badge>;
}
