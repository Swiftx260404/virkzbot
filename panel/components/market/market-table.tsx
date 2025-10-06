'use client';

import useSWR from 'swr';
import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Coins, Search, Filter } from 'lucide-react';
import clsx from 'clsx';

const categories = [
  { label: 'Todos', value: '' },
  { label: 'Herramientas', value: 'TOOL' },
  { label: 'Consumibles', value: 'CONSUMABLE' },
  { label: 'Materiales', value: 'MATERIAL' },
  { label: 'Armas', value: 'WEAPON' },
  { label: 'Armaduras', value: 'ARMOR' },
  { label: 'Misceláneo', value: 'MISC' },
];

async function fetchListings(path: string) {
  return apiFetch<{
    page: number;
    pageSize: number;
    total: number;
    listings: Array<{
      id: number;
      itemName: string;
      itemType: string;
      rarity: string;
      qty: number;
      remainingQty: number;
      price: number;
      status: string;
      createdAt: string;
      sellerId: string;
    }>;
  }>(path);
}

async function fetchMyListings() {
  return apiFetch<
    Array<{
      id: number;
      itemName: string;
      qty: number;
      remainingQty: number;
      price: number;
      status: string;
      createdAt: string;
    }>
  >('/api/market/my-listings');
}

export function MarketTable() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '10');
    if (search.trim()) {
      params.set('search', search.trim());
    }
    if (category) {
      params.set('category', category);
    }
    return `/api/market/listings?${params.toString()}`;
  }, [page, search, category]);

  const { data, isLoading } = useSWR(query, fetchListings, { keepPreviousData: true });
  const { data: myListings } = useSWR('/api/market/my-listings', fetchMyListings, {
    fallbackData: [],
    dedupingInterval: 60_000,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <Card
        title="Mis listados"
        description="Controla los ítems que tienes actualmente en el mercado."
        headerAction={
          <span className="text-sm text-slate-400">
            {myListings?.length ? `${myListings.length} activos` : 'Sin publicaciones'}
          </span>
        }
      >
        <div className="grid gap-3">
          {myListings?.length ? (
            myListings.map((listing) => (
              <div
                key={listing.id}
                className="flex items-center justify-between rounded-xl border border-panel-border/60 bg-panel-border/20 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-white">{listing.itemName}</p>
                  <p className="text-xs text-slate-500">
                    {listing.remainingQty}/{listing.qty} disponibles · {listing.price.toLocaleString()} VC
                  </p>
                </div>
                <span className="rounded-full border border-panel-border/60 px-3 py-1 text-xs text-slate-300">
                  {new Date(listing.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))
          ) : (
            <EmptyState title="Sin listados" description="Publica algo en el mercado desde Discord para verlo aquí." />
          )}
        </div>
      </Card>

      <Card title="Mercado global" description="Explora listados recientes y filtra por tipo.">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder="Buscar por nombre o clave"
              className="w-full rounded-xl border border-panel-border/60 bg-panel-border/20 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-panel-accent focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-slate-500" />
            <select
              value={category}
              onChange={(event) => {
                setPage(1);
                setCategory(event.target.value);
              }}
              className="rounded-xl border border-panel-border/60 bg-panel-border/20 px-3 py-2 text-sm text-white focus:border-panel-accent focus:outline-none"
            >
              {categories.map((option) => (
                <option key={option.value} value={option.value} className="bg-slate-900 text-white">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-panel-border/60">
          <table className="min-w-full divide-y divide-panel-border/60 text-sm">
            <thead className="bg-panel-border/20 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left">Ítem</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Rareza</th>
                <th className="px-4 py-3 text-left">Disponibles</th>
                <th className="px-4 py-3 text-left">Precio</th>
                <th className="px-4 py-3 text-left">Publicado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-panel-border/50 text-slate-200">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6">
                    <Skeleton className="h-12 w-full" />
                  </td>
                </tr>
              )}
              {!isLoading && data?.listings?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12">
                    <EmptyState title="No hay resultados" description="Intenta ajustar tus filtros o buscar otro ítem." />
                  </td>
                </tr>
              )}
              {data?.listings?.map((listing) => (
                <tr key={listing.id} className="transition hover:bg-panel-border/20">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-xl border border-panel-border/60 bg-panel-border/10">
                        <Coins className="size-4 text-panel-accent" />
                      </div>
                      <div>
                        <p className="font-semibold text-white">{listing.itemName}</p>
                        <p className="text-xs text-slate-500">#{listing.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="rounded-full border border-panel-border/60 px-3 py-1 text-xs text-slate-300">
                      {listing.itemType}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={clsx('rounded-full px-3 py-1 text-xs font-semibold', {
                        'border border-indigo-400/60 text-indigo-300': listing.rarity === 'RARE',
                        'border border-emerald-400/60 text-emerald-300': listing.rarity === 'UNCOMMON',
                        'border border-orange-400/60 text-orange-300': listing.rarity === 'EPIC',
                        'border border-fuchsia-500/70 text-fuchsia-300': listing.rarity === 'LEGENDARY' || listing.rarity === 'MYTHIC',
                        'border border-panel-border/70 text-slate-300': true,
                      })}
                    >
                      {listing.rarity}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {listing.remainingQty} / {listing.qty}
                  </td>
                  <td className="px-4 py-4 font-semibold text-panel-accent">
                    {listing.price.toLocaleString()} VC
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-400">
                    {new Date(listing.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 flex items-center justify-between text-sm text-slate-400">
          <span>
            Página {data?.page ?? page} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1}
              className="rounded-full border border-panel-border/60 px-4 py-2 text-xs font-semibold text-slate-200 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="rounded-full border border-panel-border/60 px-4 py-2 text-xs font-semibold text-slate-200 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
