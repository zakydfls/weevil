import { cn } from '@/lib/utils';

const toneClass = {
  neutral:
    'border border-[var(--border)] bg-[var(--surface)] text-[var(--ink-muted)]',
  success:
    'border border-transparent bg-[var(--success-bg)] text-[var(--success)]',
  warning:
    'border border-transparent bg-[var(--warning-bg)] text-[var(--warning)]',
  danger:
    'border border-transparent bg-[var(--danger-bg)] text-[var(--danger)]',
  info:
    'border border-transparent bg-[var(--primary-subtle)] text-[var(--primary)]',
} as const;

export type BadgeTone = keyof typeof toneClass;

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center rounded-md px-2 text-[11px] font-medium uppercase tracking-wide',
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
