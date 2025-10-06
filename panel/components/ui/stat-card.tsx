import { ReactNode } from 'react';
import clsx from 'clsx';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  className?: string;
}

export function StatCard({ title, value, description, icon, className }: StatCardProps) {
  return (
    <div className={clsx('flex flex-col gap-3 rounded-2xl border border-panel-border bg-panel-surface/80 p-5 shadow-lg', className)}>
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>{title}</span>
        {icon && <span className="text-panel-accent">{icon}</span>}
      </div>
      <div className="text-3xl font-semibold text-white">{value}</div>
      {description && <p className="text-xs text-slate-500">{description}</p>}
    </div>
  );
}
