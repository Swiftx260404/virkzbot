import { Metadata } from 'next';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { StatCard } from '@/components/ui/stat-card';
import { Card } from '@/components/ui/card';
import { Coins, Users, LineChart, Flame } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

export const metadata: Metadata = {
  title: 'Dashboard | Virkz',
};

export const dynamic = 'force-dynamic';

async function getDashboardStats() {
  return apiFetch<{
    users: number;
    totalVCoins: number;
    marketVolume: { daily: number; weekly: number };
    activeEvents: number;
    bossProgress: { name: string; health: number; healthMax: number } | null;
  }>('/api/economy/stats');
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <div className="space-y-6">
      <Breadcrumbs segments={[{ label: 'Dashboard' }]} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Usuarios totales" value={stats?.users ?? '0'} icon={<Users className="size-5" />} />
        <StatCard
          title="V Coins en circulación"
          value={stats ? stats.totalVCoins.toLocaleString() : '0'}
          icon={<Coins className="size-5" />}
        />
        <StatCard
          title="Volumen diario"
          value={stats ? `${stats.marketVolume.daily.toLocaleString()} VC` : 'N/A'}
          icon={<LineChart className="size-5" />}
        />
        <StatCard
          title="Eventos activos"
          value={stats ? stats.activeEvents : '0'}
          icon={<Flame className="size-5" />}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Economía semanal" description="Comparativa rápida de movimientos recientes">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-panel-border/60 bg-panel-border/20 p-4">
              <p className="text-sm text-slate-400">Volumen semanal</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {stats ? `${stats.marketVolume.weekly.toLocaleString()} VC` : '0 VC'}
              </p>
              <p className="mt-2 text-xs text-slate-500">Incluye ventas en mercado y transacciones registradas.</p>
            </div>
            <div className="rounded-2xl border border-panel-border/60 bg-panel-border/20 p-4">
              <p className="text-sm text-slate-400">Eventos activos</p>
              <p className="mt-2 text-2xl font-semibold text-white">{stats?.activeEvents ?? 0}</p>
              <p className="mt-2 text-xs text-slate-500">Mantente atento a los bonos temporales y drops especiales.</p>
            </div>
          </div>
        </Card>
        <Card title="Progreso de jefe" description="Último encuentro global">
          {stats?.bossProgress ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Jefe actual</p>
                  <p className="text-xl font-semibold text-white">{stats.bossProgress.name}</p>
                </div>
                <span className="rounded-full border border-panel-border/60 bg-panel-border/20 px-3 py-1 text-xs text-slate-300">
                  {Math.max(
                    0,
                    Math.round((stats.bossProgress.health / stats.bossProgress.healthMax) * 100),
                  )}
                  %
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-panel-accent"
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(100, (stats.bossProgress.health / stats.bossProgress.healthMax) * 100),
                    ).toFixed(1)}%`,
                  }}
                />
              </div>
              <p className="text-sm text-slate-400">
                {stats.bossProgress.health.toLocaleString()} / {stats.bossProgress.healthMax.toLocaleString()} HP restantes.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Aún no hay un jefe global activo. ¡Prepárate para el próximo desafío!</p>
          )}
        </Card>
      </div>
    </div>
  );
}
