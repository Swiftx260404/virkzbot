import { Metadata } from 'next';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { MarketTable } from '@/components/market/market-table';

export const metadata: Metadata = {
  title: 'Mercado | Virkz',
};

export const dynamic = 'force-dynamic';

export default function MarketPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs segments={[{ label: 'Mercado' }]} />
      <MarketTable />
    </div>
  );
}
