import { cn } from '@/lib/utils';

const toneClass = {
  neutral: 'border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--muted-foreground)]',
  success: 'border-[#b8dfcc] bg-[#e8f7ef] text-[var(--success)]',
  warning: 'border-[#f0d29a] bg-[#fff7df] text-[var(--warning)]',
  danger: 'border-[#f3b6b0] bg-[#fff0ef] text-[var(--danger)]',
  info: 'border-[#b7d8f0] bg-[#eef8ff] text-[#145d8f]',
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
        'inline-flex h-6 items-center rounded-md border px-2 text-xs font-medium',
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
