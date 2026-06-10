import { Bug } from 'lucide-react';

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-3 border border-dashed border-[var(--border)] bg-[var(--surface-subtle)] p-8 text-center">
      <Bug className="h-7 w-7 text-[var(--muted-foreground)]" aria-hidden />
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 max-w-md text-sm text-[var(--muted-foreground)]">{description}</p>
      </div>
    </div>
  );
}
