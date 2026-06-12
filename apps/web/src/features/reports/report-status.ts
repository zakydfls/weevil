import type { BadgeTone } from '@/components/ui/badge';
import type { ReportStatus } from '@/lib/api/types';

export function reportStatusTone(status: ReportStatus | string): BadgeTone {
  switch (status) {
    case 'READY':
      return 'success';
    case 'PROCESSING':
    case 'UPLOADING':
      return 'warning';
    case 'FAILED':
      return 'danger';
    case 'ARCHIVED':
      return 'neutral';
    case 'DRAFT':
    default:
      return 'info';
  }
}
