import { AdminShell } from '@/components/layout/admin-shell';
import { DashboardShell } from '@/features/reports/dashboard-shell';

export default function Home() {
  return (
    <AdminShell>
      <DashboardShell />
    </AdminShell>
  );
}
