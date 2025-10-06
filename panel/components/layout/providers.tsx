'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'react-hot-toast';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" enableSystem={false} defaultTheme="dark">
        <Toaster position="top-right" toastOptions={{ style: { background: '#0f172a', color: '#e2e8f0' } }} />
        {children}
      </ThemeProvider>
    </SessionProvider>
  );
}
