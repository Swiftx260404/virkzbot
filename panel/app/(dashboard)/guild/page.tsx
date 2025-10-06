import { Metadata } from 'next';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch } from '@/lib/api-client';
import { Users, Shield, Coins, Medal } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Gremio | Virkz',
};

export const dynamic = 'force-dynamic';

type GuildResponse = {
  guild: {
    id: number;
    name: string;
    description: string | null;
    bankCoins: number;
    leaderId: string;
    capacity: number;
    upgrades: Array<{ id: number; type: string; level: number }>;
    members: number;
  };
  role: string;
} | null;

async function getGuild() {
  return apiFetch<GuildResponse>('/api/guild/me');
}

export default async function GuildPage() {
  const guild = await getGuild();

  return (
    <div className="space-y-6">
      <Breadcrumbs segments={[{ label: 'Gremio' }]} />
      {guild ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={guild.guild.name} description={guild.guild.description ?? 'Sin descripción definida.'}>
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoTile label="Mi rol" value={guild.role} icon={<Medal className="size-4" />} />
              <InfoTile
                label="Banco"
                value={`${guild.guild.bankCoins.toLocaleString()} VC`}
                icon={<Coins className="size-4" />}
              />
              <InfoTile label="Miembros" value={`${guild.guild.members} / ${guild.guild.capacity}`} icon={<Users className="size-4" />} />
              <InfoTile label="Líder" value={guild.guild.leaderId} icon={<Shield className="size-4" />} />
            </div>
          </Card>
          <Card title="Bonificaciones" description="Mejoras desbloqueadas por tu gremio.">
            {guild.guild.upgrades.length ? (
              <ul className="space-y-3">
                {guild.guild.upgrades.map((upgrade) => (
                  <li
                    key={upgrade.id}
                    className="flex items-center justify-between rounded-xl border border-panel-border/60 bg-panel-border/20 px-4 py-3"
                  >
                    <span className="text-sm text-white">{upgrade.type}</span>
                    <span className="text-sm font-semibold text-panel-accent">Nivel {upgrade.level}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Sin mejoras" description="Tu gremio aún no ha desbloqueado bonificaciones." />
            )}
          </Card>
        </div>
      ) : (
        <EmptyState
          title="No perteneces a un gremio"
          description="Únete a uno desde Discord o crea el tuyo para desbloquear beneficios cooperativos."
        />
      )}
    </div>
  );
}

function InfoTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-panel-border/60 bg-panel-border/20 p-4">
      <div className="flex size-10 items-center justify-center rounded-xl bg-panel-border/30 text-panel-accent">{icon}</div>
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{label}</p>
        <p className="text-base font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}
