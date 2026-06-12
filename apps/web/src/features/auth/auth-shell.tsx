'use client';

import { type ReactNode } from 'react';
import { WeevilMark } from '@/components/brand/weevil-mark';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main className="grid min-h-screen grid-cols-1 bg-[var(--bg)] text-[var(--ink)] lg:grid-cols-[1fr_minmax(0,28rem)]">
      <aside
        className="relative hidden overflow-hidden border-r border-[var(--border)] lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14"
        style={{ background: 'var(--mesh-brand)' }}
      >
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--brand)]">
            <WeevilMark size={22} tone="on-brand" />
          </div>
          <span className="text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">Weevil</span>
        </div>
        <div className="relative">
          <div className="absolute -left-8 -top-12 h-72 w-72 rounded-full bg-[var(--brand)]/10 blur-3xl" />
          <div className="absolute -right-12 -bottom-10 h-64 w-64 rounded-full bg-[var(--primary)]/10 blur-3xl" />
          <div className="relative max-w-md">
            <h2 className="text-2xl font-semibold leading-snug tracking-[-0.02em] text-[var(--ink)]">
              Capture once. Hand off a debuggable session, not a screenshot.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-7 text-[var(--ink-muted)]">
              Weevil records the video, console, network, actions, errors, and DOM events of a bug —
              synced to a single timeline. Engineers reproduce it in under 90 seconds.
            </p>
          </div>
        </div>
      </aside>
      <section className="flex flex-col justify-center px-6 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-[var(--brand)]">
              <WeevilMark size={18} tone="on-brand" />
            </div>
            <span className="text-base font-semibold text-[var(--ink)]">Weevil</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--ink)]">{title}</h1>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">{subtitle}</p>
          <div className="mt-7">{children}</div>
          {footer ? <div className="mt-6 text-sm text-[var(--ink-muted)]">{footer}</div> : null}
        </div>
      </section>
    </main>
  );
}
