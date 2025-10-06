import { Metadata } from 'next';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { SoonState } from '@/components/ui/soon-state';
import { FEATURE_AUCTIONS } from '@/lib/flags';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Auctions | Virkz',
};

export default function AuctionsPage() {
  if (!FEATURE_AUCTIONS) {
    return (
      <div className="space-y-6">
        <Breadcrumbs segments={[{ label: 'Auctions' }]} />
        <SoonState
          title="Subastas en camino"
          description="Compite en pujas en tiempo real para obtener objetos exclusivos con valor creciente."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs segments={[{ label: 'Auctions' }]} />
      <Card title="Subastas" description="Intercambios dinámicos muy pronto.">
        <p className="text-sm text-slate-400">Activa FEATURE_AUCTIONS para mostrar la experiencia completa.</p>
      </Card>
    </div>
  );
}
