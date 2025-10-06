import { Metadata } from 'next';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { Card } from '@/components/ui/card';
import { AdminOnly } from '@/components/layout/admin-only';
import { AdminActions } from '@/components/panel/admin-actions';

export const metadata: Metadata = {
  title: 'Admin | Virkz',
};

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs segments={[{ label: 'Admin' }]} />
      <AdminOnly>
        <Card title="Acciones rápidas" description="Herramientas internas para el dueño del bot.">
          <AdminActions />
        </Card>
      </AdminOnly>
    </div>
  );
}
