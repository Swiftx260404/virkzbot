'use client';

import { ReactNode } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { Loader2 } from 'lucide-react';

interface ProtectedProps {
  children: ReactNode;
}

export function Protected({ children }: ProtectedProps) {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-panel-accent" />
      </div>
    );
  }

  if (!session) {
    if (typeof window !== 'undefined') {
      signIn('discord');
    }
    return null;
  }

  return <>{children}</>;
}
