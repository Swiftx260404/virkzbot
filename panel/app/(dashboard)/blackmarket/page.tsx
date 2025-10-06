import { Metadata } from 'next';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { SoonState } from '@/components/ui/soon-state';
import { FEATURE_BLACK_MARKET } from '@/lib/flags';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Black Market | Virkz',
};

export default function BlackMarketPage() {
  if (!FEATURE_BLACK_MARKET) {
    return (
      <div className="space-y-6">
        <Breadcrumbs segments={[{ label: 'Black Market' }]} />
        <SoonState
          title="Black Market en construcción"
          description="Un espacio clandestino para artículos legendarios, contratos de riesgo y trueques especiales."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs segments={[{ label: 'Black Market' }]} />
      <Card title="Black Market" description="Herramientas avanzadas próximamente.">
        <p className="text-sm text-slate-400">Activa FEATURE_BLACK_MARKET para habilitar la vista real.</p>
      </Card>
    </div>
  );
}
