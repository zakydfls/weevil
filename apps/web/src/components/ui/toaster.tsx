'use client';

import { Toaster } from 'sonner';

export { toast } from 'sonner';

export function AppToaster() {
  return (
    <Toaster
      closeButton
      richColors={false}
      position="top-right"
      visibleToasts={4}
      toastOptions={{
        classNames: {
          toast:
            'border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink)] shadow-[0_8px_8px_-8px_rgb(26_29_18_/_0.24)]',
          title: 'text-sm font-semibold text-[var(--ink)]',
          description: 'text-sm leading-5 text-[var(--ink-muted)]',
          actionButton: 'bg-[var(--primary)] text-white',
          cancelButton: 'bg-[var(--surface)] text-[var(--ink-muted)]',
          closeButton: 'border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--ink-muted)]',
          success: 'border-[var(--success)]',
          error: 'border-[var(--danger-border)]',
          warning: 'border-[var(--warning-border)]',
          loading: 'border-[var(--primary-soft)]',
        },
      }}
    />
  );
}
