import { requireAuth } from '@/lib/auth';
import DashboardShell from '@/components/ui/DashboardShell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return <DashboardShell>{children}</DashboardShell>;
}
