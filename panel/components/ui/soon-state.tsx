import { Rocket, Sparkles } from 'lucide-react';
import { SOON_ROADMAP } from '@/lib/flags';

interface SoonStateProps {
  title: string;
  description: string;
  disabledCtaLabel?: string;
}

export function SoonState({ title, description, disabledCtaLabel = 'Notificarme al lanzar' }: SoonStateProps) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 rounded-3xl border border-panel-border/70 bg-panel-surface/70 p-10 text-center shadow-2xl">
      <div className="flex flex-col items-center gap-4">
        <div className="flex size-16 items-center justify-center rounded-full bg-panel-border/60 text-panel-accent">
          <Rocket className="size-8" />
        </div>
        <div>
          <h2 className="text-3xl font-semibold text-white">{title}</h2>
          <p className="mt-2 text-base text-slate-300">{description}</p>
        </div>
        <button
          disabled
          className="flex items-center gap-2 rounded-full bg-panel-border/50 px-6 py-2 text-sm font-medium text-slate-400 opacity-70"
        >
          <Sparkles className="size-4" />
          {disabledCtaLabel}
        </button>
      </div>
      <div className="space-y-3 text-left">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-panel-accent/80">Roadmap</p>
        <ol className="space-y-4">
          {SOON_ROADMAP.map((step) => (
            <li key={step.title} className="rounded-2xl border border-panel-border/60 bg-panel-border/20 p-4">
              <p className="text-sm font-semibold text-white">{step.title}</p>
              <p className="mt-1 text-sm text-slate-400">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
