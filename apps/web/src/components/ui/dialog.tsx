'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-[var(--z-modal)] bg-[var(--ink-strong)]/40 backdrop-blur-sm data-[state=open]:weevil-fade-in',
        className,
      )}
      {...props}
    />
  );
});

const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { showClose?: boolean }
>(function DialogContent({ className, children, showClose = true, ...props }, ref) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-[calc(var(--z-modal)+1)] flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] shadow-[0_8px_8px_-8px_rgba(26,29,18,0.24)] outline-none data-[state=open]:weevil-soft-rise',
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:pointer-events-none">
            <X className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid gap-1.5 px-4 py-3 text-left', className)} {...props} />;
}

function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-[var(--divider)] bg-[var(--surface)] px-4 py-3 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}

const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-sm font-semibold tracking-[-0.01em] text-[var(--ink)]', className)}
      {...props}
    />
  );
});

const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-sm leading-6 text-[var(--ink-muted)]', className)}
      {...props}
    />
  );
});

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
    <Dialog open onOpenChange={(open) => {
      if (!open) onCancel();
    }}>
      <DialogContent className="max-w-md rounded-xl" showClose={false}>
        <DialogHeader className="grid grid-cols-[auto_1fr_auto] items-start gap-3 px-5 py-4">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md"
            style={{ backgroundColor: accentBg, color: accentColor }}
            aria-hidden
          >
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <DialogTitle>
              {options.title}
            </DialogTitle>
            {options.description ? (
              <DialogDescription asChild>
                <div className="mt-1.5">{options.description}</div>
              </DialogDescription>
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
        </DialogHeader>
        <DialogFooter className="px-5">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
