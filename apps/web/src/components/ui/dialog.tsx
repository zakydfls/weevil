'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type DialogTone = 'default' | 'danger' | 'warning';

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
}

interface AlertOptions {
  title: string;
  description?: ReactNode;
  tone?: DialogTone;
  acknowledgeLabel?: string;
}

interface DialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions) => Promise<void>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

interface PendingDialog {
  kind: 'confirm' | 'alert';
  options: ConfirmOptions | AlertOptions;
  resolve: (value: boolean) => void;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingDialog | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
        setPending({ kind: 'confirm', options, resolve });
      }),
    [],
  );

  const alertFn = useCallback(
    (options: AlertOptions) =>
      new Promise<void>((resolve) => {
        previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
        setPending({ kind: 'alert', options, resolve: () => resolve() });
      }),
    [],
  );

  function dismiss(value: boolean) {
    if (!pending) return;
    pending.resolve(value);
    setPending(null);
    // Restore focus to the trigger
    window.setTimeout(() => previouslyFocusedRef.current?.focus(), 0);
  }

  // Esc + focus trap
  useEffect(() => {
    if (!pending) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss(false);
      } else if (event.key === 'Enter' && document.activeElement?.tagName !== 'BUTTON') {
        event.preventDefault();
        dismiss(true);
      }
    }
    window.addEventListener('keydown', handleKey);
    window.setTimeout(() => confirmButtonRef.current?.focus(), 0);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const value = useMemo<DialogContextValue>(() => ({ confirm, alert: alertFn }), [confirm, alertFn]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      {pending ? (
        <DialogModal
          pending={pending}
          confirmButtonRef={confirmButtonRef}
          onConfirm={() => dismiss(true)}
          onCancel={() => dismiss(false)}
        />
      ) : null}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog() must be called inside <DialogProvider>');
  }
  return ctx;
}

function DialogModal({
  pending,
  confirmButtonRef,
  onConfirm,
  onCancel,
}: {
  pending: PendingDialog;
  confirmButtonRef: React.MutableRefObject<HTMLButtonElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { kind, options } = pending;
  const tone: DialogTone = options.tone ?? 'default';
  const isAlert = kind === 'alert';

  const accentColor =
    tone === 'danger'
      ? 'var(--danger)'
      : tone === 'warning'
        ? 'var(--warning)'
        : 'var(--primary)';
  const accentBg =
    tone === 'danger'
      ? 'var(--danger-bg)'
      : tone === 'warning'
        ? 'var(--warning-bg)'
        : 'var(--primary-subtle)';

  const confirmVariant = tone === 'danger' ? 'danger' : 'primary';
  const confirmLabel = isAlert
    ? (options as AlertOptions).acknowledgeLabel ?? 'OK'
    : (options as ConfirmOptions).confirmLabel ?? 'Confirm';
  const cancelLabel = !isAlert ? (options as ConfirmOptions).cancelLabel ?? 'Cancel' : null;

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] grid place-items-center bg-[var(--ink-strong)]/40 px-4 backdrop-blur-sm weevil-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="weevil-dialog-title"
      onClick={onCancel}
    >
      <div
        className="weevil-soft-rise w-full max-w-md overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] shadow-[0_24px_60px_-20px_rgba(26,29,18,0.35)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3 border-b border-[var(--divider)] px-5 py-4">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md"
            style={{ backgroundColor: accentBg, color: accentColor }}
            aria-hidden
          >
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 id="weevil-dialog-title" className="text-sm font-semibold tracking-[-0.01em] text-[var(--ink)]">
              {options.title}
            </h2>
            {options.description ? (
              <div className="mt-1.5 text-sm leading-6 text-[var(--ink-muted)]">{options.description}</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="grid h-7 w-7 place-items-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)]"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <div className="flex items-center justify-end gap-2 bg-[var(--surface)] px-5 py-3">
          {cancelLabel ? (
            <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
              {cancelLabel}
            </Button>
          ) : null}
          <Button
            ref={confirmButtonRef as React.Ref<HTMLButtonElement>}
            type="button"
            variant={confirmVariant}
            size="sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
