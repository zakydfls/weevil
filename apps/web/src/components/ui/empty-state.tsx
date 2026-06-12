import type { ReactNode } from 'react';
import { WeevilMark } from '@/components/brand/weevil-mark';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-5 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center sm:p-10">
      <WeevilMark size={72} tone="muted" className="weevil-mascot opacity-90" />
      <div className="max-w-md">
        <h2 className="text-lg font-semibold text-[var(--ink)]">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">{description}</p>
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
