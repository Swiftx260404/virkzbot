import { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Protected } from '@/components/layout/protected';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Protected>
      <AppShell>{children}</AppShell>
    </Protected>
  );
}
