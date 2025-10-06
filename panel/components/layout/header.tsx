'use client';

import { Menu, LogOut } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { useState } from 'react';
import Link from 'next/link';

export function Header() {
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header className="flex h-20 items-center justify-between border-b border-panel-border/60 bg-panel-surface/70 px-6 backdrop-blur">
        <div className="flex items-center gap-3 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className="rounded-xl border border-panel-border/80 bg-panel-border/30 p-2 text-slate-200"
          >
            <Menu className="size-5" />
          </button>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Virkz</p>
            <p className="text-lg font-semibold text-white">Panel</p>
          </div>
        </div>
        <div className="hidden md:block">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Bienvenido</p>
          <p className="text-lg font-semibold text-white">{session?.user?.name ?? 'Explorador'}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col text-right">
            <span className="text-sm font-medium text-white">{session?.user?.name}</span>
            {session?.user?.isAdmin && <span className="text-xs text-panel-accent">Administrador</span>}
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="rounded-full border border-panel-border/80 bg-panel-border/40 px-4 py-2 text-sm text-slate-200 transition hover:border-panel-accent/60 hover:text-white"
          >
            <div className="flex items-center gap-2">
              <LogOut className="size-4" />
              <span>Salir</span>
            </div>
          </button>
        </div>
      </header>
      {mobileOpen && (
        <div className="md:hidden">
          <nav className="space-y-1 border-b border-panel-border/60 bg-panel-surface/90 px-6 py-4">
            {[
              { name: 'Dashboard', href: '/dashboard' },
              { name: 'Mercado', href: '/market' },
              { name: 'Black Market', href: '/blackmarket' },
              { name: 'Auctions', href: '/auctions' },
              { name: 'Loans', href: '/loans' },
              { name: 'Eventos', href: '/events' },
              { name: 'Perfil', href: '/profile' },
              { name: 'Gremio', href: '/guild' },
              session?.user?.isAdmin ? { name: 'Admin', href: '/admin' } : null,
            ]
              .filter(Boolean)
              .map((item) => (
                <Link
                  key={item!.href}
                  href={item!.href}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-lg px-4 py-2 text-sm text-slate-200 hover:bg-panel-border/50"
                >
                  {item!.name}
                </Link>
              ))}
          </nav>
        </div>
      )}
    </>
  );
}
