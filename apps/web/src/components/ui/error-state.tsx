'use client';

import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Shown when a data fetch FAILS — distinct from EmptyState (which means "loaded,
 * genuinely nothing here"). Never render EmptyState on an error: a failed/slow
 * request that reads as "empty" is the #1 source of user confusion.
 */
export function ErrorState({
  title = 'Couldn’t load this',
  description = 'The request failed. Check your connection and try again.',
  onRetry,
  compact = false,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center gap-4 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-center ${
        compact ? 'min-h-40 p-6' : 'min-h-72 p-8 sm:p-10'
      }`}
    >
      <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--bg)] text-[var(--danger)] ring-1 ring-[var(--danger-border)]">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </span>
      <div className="max-w-md">
        <h2 className="text-base font-semibold text-[var(--ink)]">{title}</h2>
        <p className="mt-1.5 text-sm leading-6 text-[var(--ink-muted)]">{description}</p>
      </div>
      {onRetry ? (
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
          Try again
        </Button>
      ) : null}
    </div>
  );
}
