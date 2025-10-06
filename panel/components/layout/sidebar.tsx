'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import {
  Home,
  ShoppingBag,
  Store,
  ShieldAlert,
  Gem,
  Trophy,
  Users,
  Swords,
  ScrollText,
  Settings,
  Coins,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Mercado', href: '/market', icon: Store },
  { name: 'Black Market', href: '/blackmarket', icon: ShieldAlert },
  { name: 'Auctions', href: '/auctions', icon: Trophy },
  { name: 'Loans', href: '/loans', icon: Coins },
  { name: 'Eventos', href: '/events', icon: ScrollText },
  { name: 'Perfil', href: '/profile', icon: ShoppingBag },
  { name: 'Gremio', href: '/guild', icon: Users },
  { name: 'Admin', href: '/admin', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-full w-64 flex-shrink-0 border-r border-panel-border/60 bg-panel-surface/60 backdrop-blur-lg md:flex md:flex-col">
      <div className="flex h-20 items-center gap-3 border-b border-panel-border/70 px-6">
        <div className="flex size-12 items-center justify-center rounded-xl bg-panel-accent/20 text-panel-accent">
          <Swords className="size-6" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Virkz</p>
          <p className="text-lg font-semibold text-white">Command Center</p>
        </div>
      </div>
      <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-6">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors',
                isActive ? 'bg-panel-accent/10 text-white' : 'text-slate-400 hover:bg-panel-border/40 hover:text-white',
              )}
            >
              <Icon className="size-4" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
