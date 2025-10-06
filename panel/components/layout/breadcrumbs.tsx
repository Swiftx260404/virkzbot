import Link from 'next/link';

interface BreadcrumbsProps {
  segments: Array<{ href?: string; label: string }>;
}

export function Breadcrumbs({ segments }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-2 text-sm text-slate-400" aria-label="Breadcrumb">
      {segments.map((segment, index) => (
        <span key={segment.label} className="flex items-center gap-2">
          {segment.href ? (
            <Link href={segment.href} className="hover:text-panel-accent">
              {segment.label}
            </Link>
          ) : (
            <span className="text-white">{segment.label}</span>
          )}
          {index < segments.length - 1 && <span className="text-slate-600">/</span>}
        </span>
      ))}
    </nav>
  );
}
