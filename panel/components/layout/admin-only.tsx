'use client';

import { ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { ShieldOff } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

interface AdminOnlyProps {
  children: ReactNode;
}

export function AdminOnly({ children }: AdminOnlyProps) {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <div className="animate-pulse rounded-2xl border border-panel-border/70 bg-panel-surface/50 p-10" />;
  }

  if (!session?.user?.isAdmin) {
    return (
      <EmptyState
        title="Acceso restringido"
        description="Solo el dueño del bot puede usar estas herramientas."
        icon={<ShieldOff className="size-6" />}
      />
    );
  }

  return <>{children}</>;
}
