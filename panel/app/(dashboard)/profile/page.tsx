import { Metadata } from 'next';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { apiFetch } from '@/lib/api-client';
import { Sparkles, Shield, Swords, Award } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Perfil | Virkz',
};

export const dynamic = 'force-dynamic';

interface ProfileResponse {
  user: {
    id: string;
    vcoins: number;
    level: number;
    xp: number;
    attack: number;
    defense: number;
    energy: number;
    strength: number;
    agility: number;
    intellect: number;
    luck: number;
  } | null;
  inventory: Array<{ id: number; itemId: number; name: string; quantity: number; rarity: string }>;
  equipment: {
    weapon: { id: number; name: string; type: string; rarity: string } | null;
    armor: { id: number; name: string; type: string; rarity: string } | null;
    pickaxe: { id: number; name: string; type: string; rarity: string } | null;
    rod: { id: number; name: string; type: string; rarity: string } | null;
  };
  activePet: { id: number; name: string; level: number; rarity: string } | null;
}

async function getProfile() {
  return apiFetch<ProfileResponse>('/api/profile/me');
}

export default async function ProfilePage() {
  const profile = await getProfile();

  return (
    <div className="space-y-6">
      <Breadcrumbs segments={[{ label: 'Perfil' }]} />
      {profile?.user ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Resumen" description="Estado general de tu cuenta.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-panel-border/60 bg-panel-border/20 p-4">
                <p className="text-sm text-slate-400">Nivel</p>
                <p className="mt-2 text-2xl font-semibold text-white">{profile.user.level}</p>
                <p className="text-xs text-slate-500">XP acumulada: {profile.user.xp.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-panel-border/60 bg-panel-border/20 p-4">
                <p className="text-sm text-slate-400">V Coins</p>
                <p className="mt-2 text-2xl font-semibold text-panel-accent">{profile.user.vcoins.toLocaleString()}</p>
                <p className="text-xs text-slate-500">Saldo disponible para compras.</p>
              </div>
              <div className="rounded-2xl border border-panel-border/60 bg-panel-border/20 p-4">
                <p className="text-sm text-slate-400">Ataque / Defensa</p>
                <p className="mt-2 text-xl font-semibold text-white">
                  {profile.user.attack} / {profile.user.defense}
                </p>
                <p className="text-xs text-slate-500">Potencia en combate directo.</p>
              </div>
              <div className="rounded-2xl border border-panel-border/60 bg-panel-border/20 p-4">
                <p className="text-sm text-slate-400">Energía</p>
                <p className="mt-2 text-xl font-semibold text-white">{profile.user.energy}</p>
                <p className="text-xs text-slate-500">Disponible para trabajar, minar y explorar.</p>
              </div>
            </div>
          </Card>
          <Card title="Atributos" description="Distribución de puntos de habilidad.">
            <div className="grid gap-4 sm:grid-cols-2">
              <AttributeChip label="Fuerza" value={profile.user.strength} icon={<Swords className="size-4" />} />
              <AttributeChip label="Agilidad" value={profile.user.agility} icon={<Sparkles className="size-4" />} />
              <AttributeChip label="Intelecto" value={profile.user.intellect} icon={<Shield className="size-4" />} />
              <AttributeChip label="Suerte" value={profile.user.luck} icon={<Award className="size-4" />} />
            </div>
          </Card>
          <Card title="Equipo" description="Tu arsenal actual.">
            <div className="grid gap-4 sm:grid-cols-2">
              <EquipmentItem label="Arma" item={profile.equipment.weapon} />
              <EquipmentItem label="Armadura" item={profile.equipment.armor} />
              <EquipmentItem label="Pico" item={profile.equipment.pickaxe} />
              <EquipmentItem label="Caña" item={profile.equipment.rod} />
            </div>
          </Card>
          <Card title="Inventario destacado" description="Los ítems con mayor cantidad.">
            {profile.inventory.length ? (
              <ul className="space-y-3">
                {profile.inventory.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-panel-border/60 bg-panel-border/20 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">{item.name}</p>
                      <p className="text-xs text-slate-500">Rareza: {item.rarity}</p>
                    </div>
                    <span className="text-sm font-semibold text-panel-accent">x{item.quantity}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Sin ítems" description="Aún no tienes objetos destacados." />
            )}
          </Card>
          <Card title="Mascota activa" description="Compañero que te acompaña en la aventura." className="lg:col-span-2">
            {profile.activePet ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-white">{profile.activePet.name}</p>
                  <p className="text-sm text-slate-400">Nivel {profile.activePet.level}</p>
                </div>
                <span className="rounded-full border border-panel-border/60 px-4 py-2 text-xs text-slate-300">
                  Rareza: {profile.activePet.rarity}
                </span>
              </div>
            ) : (
              <EmptyState title="Sin mascota activa" description="Equipa una mascota desde Discord para verla aquí." />
            )}
          </Card>
        </div>
      ) : (
        <EmptyState
          title="Perfil no disponible"
          description="No encontramos tu progreso. Intenta jugar un poco en Discord y vuelve más tarde."
        />
      )}
    </div>
  );
}

function AttributeChip({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-panel-border/60 bg-panel-border/20 p-4">
      <div className="flex size-10 items-center justify-center rounded-xl bg-panel-border/30 text-panel-accent">{icon}</div>
      <div>
        <p className="text-sm text-slate-400">{label}</p>
        <p className="text-xl font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}

function EquipmentItem({
  label,
  item,
}: {
  label: string;
  item: { id: number; name: string; type: string; rarity: string } | null;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-panel-border/60 bg-panel-border/20 px-4 py-3">
      <div>
        <p className="text-sm text-slate-400">{label}</p>
        <p className="text-base font-semibold text-white">{item?.name ?? 'Sin asignar'}</p>
      </div>
      {item && <span className="text-xs text-panel-accent">{item.rarity}</span>}
    </div>
  );
}
