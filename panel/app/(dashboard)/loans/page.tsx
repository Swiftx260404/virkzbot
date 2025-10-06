import { Metadata } from 'next';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { SoonState } from '@/components/ui/soon-state';
import { FEATURE_LOANS } from '@/lib/flags';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Loans | Virkz',
};

export default function LoansPage() {
  if (!FEATURE_LOANS) {
    return (
      <div className="space-y-6">
        <Breadcrumbs segments={[{ label: 'Loans' }]} />
        <SoonState
          title="Préstamos en preparación"
          description="Financia tus aventuras con créditos flexibles y recompensas por pagar a tiempo."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs segments={[{ label: 'Loans' }]} />
      <Card title="Préstamos" description="Pronto podrás solicitar y administrar financiamientos.">
        <p className="text-sm text-slate-400">Activa FEATURE_LOANS para desplegar el módulo final.</p>
      </Card>
    </div>
  );
}
