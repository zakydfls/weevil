'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Check, ChevronDown, KanbanSquare, LayoutGrid, LogOut, Plus, Search, Settings, ShieldCheck } from 'lucide-react';
import { WeevilLogo } from '@/components/brand/weevil-mark';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { startExtensionCapture } from '@/lib/extension-bridge';
import { useExtensionInstalled } from '@/lib/use-extension-installed';
import { useAuth } from '@/features/auth/auth-context';

const navigation = [
  { href: '/captures', label: 'Captures', icon: LayoutGrid },
  { href: '/board', label: 'Board', icon: KanbanSquare },
] as const;
const platformNav = { href: '/platform', label: 'Platform', icon: ShieldCheck } as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { status: extStatus } = useExtensionInstalled();
  const extMissing = extStatus === 'missing';
  const [isStartingCapture, setIsStartingCapture] = useState(false);

  // Captures is the home of the capture artifact, so the capture-detail route
  // (/c/[id]) keeps the Captures tab highlighted.
  function isActive(href: string) {
    if (href === '/captures') return pathname === '/captures' || pathname.startsWith('/c/');
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function openSettings() {
    router.push('/settings');
  }

  function openCommandPalette() {
    window.dispatchEvent(new CustomEvent('weevil:open-command-palette'));
  }

  async function handleNewCapture() {
    setIsStartingCapture(true);
    try {
      await startExtensionCapture({ redactSensitiveData: true });
    } catch {
      // The dashboard already surfaces capture-start errors when the user is on the captures view.
    } finally {
      setIsStartingCapture(false);
    }
  }

  // Show loading shell during auth bootstrap so we don't render the dashboard with no workspace
  if (auth.status === 'loading') {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--bg)]">
        <div
          role="status"
          aria-live="polite"
          className="weevil-soft-rise flex flex-col items-center text-center"
        >
          <div className="weevil-mascot rounded-xl bg-[var(--primary-subtle)] p-2 shadow-[0_16px_36px_-26px_rgba(26,29,18,0.42)]">
            <WeevilLogo size={42} />
          </div>
          <div className="mt-3 text-sm font-semibold tracking-tight text-[var(--ink)]">Weevil</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
            loading workspace
          </div>
        </div>
      </main>
    );
  }
  if (auth.status === 'unauthenticated') {
    // AuthProvider already redirects to /login; render nothing meanwhile.
    return null;
  }

  const isSettings = pathname === '/settings';

  return (
    <main className="grid min-h-screen grid-rows-[auto_1fr_auto] [grid-template-columns:minmax(0,1fr)] bg-[var(--bg)] text-[var(--ink)] sm:grid-rows-[auto_1fr]">
      <header className="sticky top-0 z-[var(--z-sticky)] flex h-14 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg)]/90 px-3 backdrop-blur sm:gap-3 lg:px-6">
        <button
          type="button"
          onClick={() => router.push('/captures')}
          className="flex items-center gap-2 sm:gap-2.5"
          aria-label="Weevil home"
        >
          <WeevilLogo size={28} />
          <span className="hidden font-semibold tracking-tight text-[var(--ink)] sm:inline">Weevil</span>
        </button>

        <WorkspaceSwitcher />

        {/* Desktop primary nav (sm+). Mobile uses bottom-bar below. */}
        <nav className="ml-1 hidden items-center gap-0.5 sm:flex" aria-label="Primary">
          {navigation.map((item) => {
            const active = isActive(item.href);
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => router.push(item.href)}
                className={`relative inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors ${
                  active
                    ? 'text-[var(--ink)]'
                    : 'text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]'
                }`}
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
                {active ? (
                  <span className="absolute inset-x-3 -bottom-[15px] h-[2px] rounded-full bg-[var(--primary)]" />
                ) : null}
              </button>
            );
          })}
          {auth.user?.platformRole === 'PLATFORM_ADMIN' ? (
            <button
              type="button"
              onClick={() => router.push(platformNav.href)}
              className={`relative inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors ${
                isActive(platformNav.href)
                  ? 'text-[var(--ink)]'
                  : 'text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]'
              }`}
              title="Platform admin — cross-tenant"
            >
              <platformNav.icon className="h-4 w-4" aria-hidden />
              <span className="hidden md:inline">{platformNav.label}</span>
              {isActive(platformNav.href) ? (
                <span className="absolute inset-x-3 -bottom-[15px] h-[2px] rounded-full bg-[var(--primary)]" />
              ) : null}
            </button>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm text-[var(--ink-faint)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--ink-muted)] md:flex"
          >
            <Search className="h-3.5 w-3.5" aria-hidden />
            <span>Search</span>
            <kbd className="ml-3 inline-flex items-center gap-0.5 rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-px font-mono text-[10px] text-[var(--ink-muted)]">
              <span aria-label="Command">⌘</span>K
            </kbd>
          </button>
          <button
            type="button"
            onClick={openCommandPalette}
            className="grid h-9 w-9 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] md:hidden"
            aria-label="Open search"
          >
            <Search className="h-4 w-4" aria-hidden />
          </button>
          {extMissing ? (
            <Tooltip
              content={
                <>
                  No extension, no capture. The <strong>Weevil extension</strong> isn’t
                  installed (or is taking a nap). Add it to Chrome, then this button wakes right up.
                </>
              }
            >
              <Button
                type="button"
                variant="primary"
                className="h-9 pointer-events-none opacity-60"
                disabled
                aria-label="New capture — Weevil extension required"
              >
                <Plus className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">New capture</span>
              </Button>
            </Tooltip>
          ) : (
            <Button
              type="button"
              variant="primary"
              className="h-9"
              disabled={isStartingCapture || extStatus === 'checking'}
              onClick={() => void handleNewCapture()}
            >
              <Plus className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">New capture</span>
            </Button>
          )}
          <Button
            type="button"
            variant={isSettings ? 'secondary' : 'ghost'}
            size="icon"
            onClick={openSettings}
            aria-label="Settings"
            className="hidden sm:inline-flex"
          >
            <Settings className="h-4 w-4" aria-hidden />
          </Button>
          <UserMenu />
        </div>
      </header>

      <section className="min-h-0 min-w-0 bg-[var(--bg)] pb-16 sm:pb-0">{children}</section>

      {/* Mobile bottom-bar nav (visible <sm). Clean white, terracotta active. */}
      <nav
        className="sticky bottom-0 z-[var(--z-sticky)] flex h-14 items-stretch border-t border-[var(--border)] bg-[var(--bg)]/95 px-1 backdrop-blur sm:hidden"
        aria-label="Primary (mobile)"
      >
        {navigation.map((item) => {
          const active = isActive(item.href);
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => router.push(item.href)}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                active ? 'text-[var(--primary)]' : 'text-[var(--ink-muted)]'
              }`}
            >
              <item.icon className="h-4 w-4" aria-hidden />
              {item.label}
              {active ? (
                <span className="absolute inset-x-6 top-0 h-[2px] rounded-b-full bg-[var(--primary)]" />
              ) : null}
            </button>
          );
        })}
        {auth.user?.platformRole === 'PLATFORM_ADMIN' ? (
          <button
            type="button"
            onClick={() => router.push(platformNav.href)}
            className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
              isActive(platformNav.href) ? 'text-[var(--primary)]' : 'text-[var(--ink-muted)]'
            }`}
            title="Platform admin"
          >
            <platformNav.icon className="h-4 w-4" aria-hidden />
            Platform
            {isActive(platformNav.href) ? (
              <span className="absolute inset-x-6 top-0 h-[2px] rounded-b-full bg-[var(--primary)]" />
            ) : null}
          </button>
        ) : null}
        <button
          type="button"
          onClick={openSettings}
          className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
            isSettings ? 'text-[var(--primary)]' : 'text-[var(--ink-muted)]'
          }`}
        >
          <Settings className="h-4 w-4" aria-hidden />
          Settings
          {isSettings ? (
            <span className="absolute inset-x-6 top-0 h-[2px] rounded-b-full bg-[var(--primary)]" />
          ) : null}
        </button>
      </nav>
    </main>
  );
}

function WorkspaceSwitcher() {
  const auth = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (!auth.workspace) return null;

  return (
    <div ref={ref} className="relative ml-2">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-sm font-medium text-[var(--ink)] transition-colors hover:border-[var(--border-strong)]"
      >
        <span className="grid h-5 w-5 place-items-center rounded bg-[var(--ink)] font-mono text-[10px] font-semibold text-white">
          {auth.workspace.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-[8rem] truncate sm:inline">{auth.workspace.name}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-muted)]" aria-hidden />
      </button>
      {isOpen ? (
        <div className="absolute left-0 top-11 z-[var(--z-dropdown)] w-72 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1.5 shadow-[0_8px_24px_-12px_rgba(26,29,18,0.18)]">
          <div className="px-2 pb-1 pt-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
            workspaces
          </div>
          {auth.workspaces.map((ws) => {
            const isActive = auth.workspace?.id === ws.id;
            return (
              <button
                key={ws.id}
                type="button"
                onClick={async () => {
                  setIsOpen(false);
                  if (!isActive) await auth.switchWorkspace(ws.slug);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                  isActive ? 'bg-[var(--primary-subtle)]' : 'hover:bg-[var(--surface)]'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded bg-[var(--ink)] font-mono text-[10px] font-semibold text-white">
                    {ws.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-[var(--ink)]">{ws.name}</span>
                    <span className="block truncate font-mono text-[10px] text-[var(--ink-faint)]">
                      {ws.slug} · {ws.role.toLowerCase()}
                    </span>
                  </span>
                </span>
                {isActive ? <Check className="h-3.5 w-3.5 text-[var(--primary)]" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function UserMenu() {
  const auth = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setIsOpen(false);
    }
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (!auth.user) return null;

  const initials = (auth.user.displayName ?? auth.user.email).slice(0, 2).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="grid h-9 w-9 place-items-center rounded-full bg-[var(--ink)] font-mono text-[11px] font-semibold text-white transition-transform hover:scale-105"
        aria-label="Account menu"
      >
        {initials}
      </button>
      {isOpen ? (
        <div className="absolute right-0 top-11 z-[var(--z-dropdown)] w-64 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1.5 shadow-[0_8px_24px_-12px_rgba(26,29,18,0.18)]">
          <div className="rounded-md bg-[var(--surface)] px-3 py-2">
            <div className="truncate text-sm font-semibold text-[var(--ink)]">
              {auth.user.displayName ?? 'Unnamed'}
            </div>
            <div className="truncate font-mono text-[11px] text-[var(--ink-faint)]">{auth.user.email}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              void auth.logout();
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
