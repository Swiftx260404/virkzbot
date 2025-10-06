import { ReactNode } from 'react';
import { Ghost } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-panel-border/80 bg-panel-surface/50 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-panel-border/60 text-panel-accent">
        {icon ?? <Ghost className="size-6" />}
      </div>
      <div>
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        {description && <p className="mt-2 text-sm text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}
