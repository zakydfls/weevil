'use client';

import { type ReactNode } from 'react';
import { Activity, MousePointer2, TerminalSquare, Wifi } from 'lucide-react';
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
        style={{
          background:
            'linear-gradient(135deg, oklch(0.982 0.012 220) 0%, var(--surface-elevated) 52%, oklch(0.978 0.008 110) 100%)',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--brand)]">
            <WeevilMark size={22} tone="on-brand" />
          </div>
          <span className="text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">Weevil</span>
        </div>
        <div className="relative grid gap-8">
          <SessionPreview />
          <div className="relative max-w-md">
            <h2 className="text-2xl font-semibold leading-snug tracking-[-0.02em] text-[var(--ink)]">
              Capture the session context your team needs to reproduce issues.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-7 text-[var(--ink-muted)]">
              Weevil records video, console, network, actions, errors, and DOM events in a single
              timeline for faster review.
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

function SessionPreview() {
  const metrics = [
    { label: 'Console', value: '0', icon: TerminalSquare, tone: 'text-[var(--tl-console)]' },
    { label: 'Network', value: '34', icon: Wifi, tone: 'text-[var(--tl-network)]' },
    { label: 'Actions', value: '47', icon: MousePointer2, tone: 'text-[var(--tl-action)]' },
    { label: 'Perf', value: '107', icon: Activity, tone: 'text-[var(--tl-performance)]' },
  ];

  return (
    <div className="weevil-session-preview max-w-xl rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 shadow-[0_8px_8px_-8px_rgba(26,29,18,0.18)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--primary)]" />
          <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--ink-faint)]">
            Live capture
          </span>
        </div>
        <span className="rounded-md bg-[var(--primary-subtle)] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)]">
          Ready
        </span>
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-[var(--divider)] bg-[var(--bg)]">
        <div className="h-24 bg-[linear-gradient(180deg,var(--surface-cool),var(--bg))] p-3">
          <div className="grid h-full grid-cols-[0.42fr_1fr] gap-3">
            <div className="rounded-md bg-[var(--accent-cool)]/85" />
            <div className="space-y-2">
              <div className="h-3 w-1/2 rounded bg-[var(--ink)]/15" />
              <div className="h-3 w-4/5 rounded bg-[var(--ink)]/10" />
              <div className="h-8 rounded border border-[var(--border)] bg-[var(--surface-elevated)]" />
              <div className="h-3 w-2/3 rounded bg-[var(--ink)]/10" />
            </div>
          </div>
        </div>
        <div className="relative h-10 border-t border-[var(--divider)] bg-[var(--surface-warm)]">
          <div className="weevil-timeline-scan absolute inset-y-0 left-0 w-14 bg-[var(--primary-soft)]" />
          {[18, 32, 38, 58, 62, 78].map((left, index) => (
            <span
              key={left}
              className="weevil-event-dot absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[var(--primary)]"
              style={{ left: `${left}%`, animationDelay: `${index * 120}ms` }}
            />
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {metrics.map((item) => (
          <div key={item.label} className="rounded-md border border-[var(--divider)] bg-[var(--surface)] px-2 py-2">
            <div className="flex items-center gap-1.5">
              <item.icon className={`h-3.5 w-3.5 ${item.tone}`} aria-hidden />
              <span className="font-mono text-[11px] font-semibold text-[var(--ink)]">{item.value}</span>
            </div>
            <div className="mt-1 truncate font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
