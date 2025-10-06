import { ReactNode } from 'react';
import clsx from 'clsx';

interface CardProps {
  title?: string;
  description?: string;
  className?: string;
  children: ReactNode;
  headerAction?: ReactNode;
}

export function Card({ title, description, className, children, headerAction }: CardProps) {
  return (
    <div className={clsx('rounded-2xl border border-panel-border bg-panel-surface/80 shadow-lg backdrop-blur-sm', className)}>
      {(title || description) && (
        <div className="flex items-center justify-between gap-4 border-b border-panel-border/60 px-6 py-4">
          <div>
            {title && <h3 className="text-lg font-semibold text-white">{title}</h3>}
            {description && <p className="text-sm text-slate-400">{description}</p>}
          </div>
          {headerAction}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}
