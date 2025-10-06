import { Metadata } from 'next';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { CalendarDays } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

export const metadata: Metadata = {
  title: 'Eventos | Virkz',
};

export const dynamic = 'force-dynamic';

async function getEvents() {
  return apiFetch<
    Array<{
      id: number;
      name: string;
      description: string;
      startDate: string;
      endDate: string;
      isActive: boolean;
    }>
  >('/api/events/active');
}

export default async function EventsPage() {
  const events = await getEvents();

  return (
    <div className="space-y-6">
      <Breadcrumbs segments={[{ label: 'Eventos' }]} />
      <Card title="Eventos especiales" description="Mantente atento a las oportunidades únicas en Virkz.">
        {events && events.length > 0 ? (
          <div className="space-y-4">
            {events.map((event) => (
              <div
                key={event.id}
                className="rounded-2xl border border-panel-border/60 bg-panel-border/20 p-5 shadow-inner"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-white">{event.name}</p>
                    <p className="mt-1 text-sm text-slate-400">{event.description}</p>
                  </div>
                  <span className="flex items-center gap-2 rounded-full border border-panel-border/60 px-3 py-1 text-xs text-slate-300">
                    <CalendarDays className="size-4" />
                    {new Date(event.startDate).toLocaleDateString()} - {new Date(event.endDate).toLocaleDateString()}
                  </span>
                </div>
                {event.isActive && (
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-panel-accent">
                    Evento activo
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Sin eventos activos por ahora"
            description="El equipo está preparando nuevas aventuras. ¡Vuelve pronto!"
            icon={<CalendarDays className="size-6" />}
          />
        )}
      </Card>
    </div>
  );
}
