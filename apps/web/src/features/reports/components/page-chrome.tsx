import type { ReactNode } from 'react';

/** Shared page heading used across dashboard routes (captures, settings, …). */
export function PageHeader({
  title,
  subtitle,
  rightSlot,
}: {
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
}) {
  return (
    <header className="weevil-step-enter flex min-w-0 flex-col items-start justify-between gap-3 px-4 pb-4 pt-6 sm:flex-row sm:items-end sm:px-6 sm:pb-5 sm:pt-8">
      <div className="min-w-0">
        <h1 className="weevil-page-title text-2xl font-semibold tracking-[-0.02em] text-[var(--ink)]">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-[var(--ink-muted)]">{subtitle}</p> : null}
      </div>
      {rightSlot ? <div className="flex w-full min-w-0 items-center justify-start gap-2 sm:w-auto sm:justify-end">{rightSlot}</div> : null}
    </header>
  );
}
