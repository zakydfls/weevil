'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Check,
  ChevronDown,
  KanbanSquare,
  LayoutGrid,
  Loader2,
  LogOut,
  Plus,
  Search,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { WeevilLogo } from '@/components/brand/weevil-mark';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useDialog,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/toaster';
import { ApiError } from '@/lib/api/client';
import { useExtensionInstalled } from '@/lib/use-extension-installed';
import { useAuth } from '@/features/auth/auth-context';
import { reportKeys } from '@/features/reports/queries';

const navigation = [
  { href: '/captures', label: 'Captures', icon: LayoutGrid },
  { href: '/board', label: 'Board', icon: KanbanSquare },
] as const;
const platformNav = { href: '/platform', label: 'Platform', icon: ShieldCheck } as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const dialog = useDialog();
  const router = useRouter();
  const pathname = usePathname();
  const { status: extStatus } = useExtensionInstalled();
  const extMissing = extStatus === 'missing';

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

  function handleNewCapture() {
    void dialog.alert({
      title: 'Start capture from the extension',
      description: (
        <>
          Open the page you want to record, click the Weevil icon in the browser toolbar, then press
          Start capture. Chrome only grants tab recording permission from that extension button.
        </>
      ),
      acknowledgeLabel: 'Got it',
    });
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
                <span className="hidden sm:inline">Use extension</span>
              </Button>
            </Tooltip>
          ) : (
            <Tooltip
              content="Open the target tab, then use the Weevil extension button in the browser toolbar."
            >
              <Button
                type="button"
                variant="primary"
                className="h-9"
                disabled={extStatus === 'checking'}
                onClick={handleNewCapture}
              >
                <Plus className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">New capture</span>
              </Button>
            </Tooltip>
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
  const queryClient = useQueryClient();
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filteredWorkspaces = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return auth.workspaces;
    return auth.workspaces.filter((ws) =>
      `${ws.name} ${ws.slug} ${ws.role}`.toLowerCase().includes(needle),
    );
  }, [auth.workspaces, query]);

  if (!auth.workspace) return null;

  async function switchWorkspace(slug: string, name: string) {
    const toastId = toast.loading('Switching workspace…', {
      description: `Opening ${name}.`,
    });

    try {
      await auth.switchWorkspace(slug);
      await queryClient.invalidateQueries({ queryKey: reportKeys.all });
      toast.success('Workspace switched', {
        id: toastId,
        description: `${name} is active now.`,
      });
    } catch (error) {
      toast.error('Could not switch workspace', {
        id: toastId,
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  }

  return (
    <div className="ml-2">
      <DropdownMenu
        open={isSwitcherOpen}
        onOpenChange={(open) => {
          setIsSwitcherOpen(open);
          if (!open) setQuery('');
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            className="h-9 gap-1.5 rounded-md bg-[var(--surface)] px-2.5 hover:bg-[var(--surface)]"
          >
            <WorkspaceAvatar name={auth.workspace.name} size="sm" />
            <span className="hidden max-w-[8rem] truncate sm:inline">{auth.workspace.name}</span>
            <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-muted)]" aria-hidden />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
          <DropdownMenuLabel className="border-b border-[var(--divider)] bg-[var(--surface)] px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <WorkspaceAvatar name={auth.workspace.name} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[var(--ink)]">
                  {auth.workspace.name}
                </div>
                <div className="truncate font-mono text-[10px] text-[var(--ink-faint)]">
                  {auth.workspace.slug} · {auth.workspace.role.toLowerCase()}
                </div>
              </div>
            </div>
          </DropdownMenuLabel>
          <div className="border-b border-[var(--divider)] p-1.5">
            <label className="relative block">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-faint)]"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder="Find workspace"
                className="h-8 rounded-md border-transparent bg-[var(--surface)] pl-8 pr-2 focus:bg-[var(--bg)]"
              />
            </label>
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5 thin-scrollbar">
            {filteredWorkspaces.length > 0 ? (
              filteredWorkspaces.map((ws) => {
                const isActive = auth.workspace?.id === ws.id;
                return (
                  <DropdownMenuItem
                    key={ws.id}
                    onSelect={(event) => {
                      event.preventDefault();
                      setIsSwitcherOpen(false);
                      setQuery('');
                      if (!isActive) void switchWorkspace(ws.slug, ws.name);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                      isActive ? 'bg-[var(--primary-subtle)]' : 'focus:bg-[var(--surface)]'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <WorkspaceAvatar name={ws.name} active={isActive} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-[var(--ink)]">
                          {ws.name}
                        </span>
                        <span className="block truncate font-mono text-[10px] text-[var(--ink-faint)]">
                          {ws.slug} · {ws.role.toLowerCase()}
                        </span>
                      </span>
                    </span>
                    {isActive ? (
                      <Check className="h-3.5 w-3.5 text-[var(--primary)]" aria-hidden />
                    ) : null}
                  </DropdownMenuItem>
                );
              })
            ) : (
              <div className="px-3 py-5 text-center text-sm text-[var(--ink-muted)]">
                No matching workspace.
              </div>
            )}
          </div>
          <div className="border-t border-[var(--divider)] bg-[var(--surface)] p-1.5">
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setIsSwitcherOpen(false);
                setQuery('');
                setIsCreateOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium text-[var(--primary)] transition-colors focus:bg-[var(--primary-subtle)]"
            >
              <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--primary-subtle)] text-[var(--primary)]">
                <Plus className="h-3.5 w-3.5" aria-hidden />
              </span>
              New workspace
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWorkspaceModal open={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}

function WorkspaceAvatar({
  name,
  active = false,
  size = 'md',
}: {
  name: string;
  active?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <Avatar
      className={`rounded-md ${
        size === 'sm' ? 'h-5 w-5 text-[10px]' : 'h-7 w-7 text-[11px]'
      }`}
    >
      <AvatarFallback
        className={`rounded-md font-mono font-semibold ${
          active ? 'bg-[var(--primary)] text-white' : 'bg-[var(--ink)] text-white'
        }`}
      >
        {workspaceInitial(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function CreateWorkspaceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const nameRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cleanName = name.trim();
  const cleanSlug = slug.trim().toLowerCase();
  const nameError =
    cleanName.length > 0 && cleanName.length < 2 ? 'Workspace name must be at least 2 characters.' : '';
  const slugError =
    cleanSlug.length > 0 && !isValidWorkspaceSlug(cleanSlug)
      ? 'Slug must be 2-40 lowercase letters, numbers, or hyphens.'
      : '';
  const canSubmit =
    cleanName.length >= 2 && isValidWorkspaceSlug(cleanSlug) && !isSubmitting && !nameError && !slugError;

  useEffect(() => {
    if (!open) return;
    setName('');
    setSlug('');
    setSlugTouched(false);
    setError('');
    setIsSubmitting(false);
    const focusTimer = window.setTimeout(() => nameRef.current?.focus(), 40);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isSubmitting, onClose, open]);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlugTouched(true);
    setSlug(slugify(value));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const workspaceName = cleanName;
    const workspaceSlug = cleanSlug;

    if (workspaceName.length < 2) {
      setError('Workspace name must be at least 2 characters.');
      return;
    }
    if (!isValidWorkspaceSlug(workspaceSlug)) {
      setError('Slug must be 2-40 lowercase letters, numbers, or hyphens.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    const toastId = toast.loading('Creating workspace…', {
      description: `${workspaceName} will become your active workspace.`,
    });
    try {
      await auth.createWorkspace({ name: workspaceName, slug: workspaceSlug });
      await queryClient.invalidateQueries({ queryKey: reportKeys.all });
      toast.success('Workspace created', {
        id: toastId,
        description: `${workspaceName} is active now.`,
      });
      onClose();
    } catch (err) {
      const message = formatCreateWorkspaceError(err, workspaceSlug);
      setError(message);
      toast.error('Could not create workspace', {
        id: toastId,
        description: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isSubmitting) onClose();
      }}
    >
      <DialogContent
        showClose={!isSubmitting}
        className="max-w-md p-0"
        onEscapeKeyDown={(event) => {
          if (isSubmitting) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isSubmitting) event.preventDefault();
        }}
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <DialogHeader className="grid grid-cols-[auto_1fr] items-start gap-3 border-b border-[var(--divider)] pr-12">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-[var(--primary-subtle)] text-[var(--primary)]">
              <Building2 className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <DialogTitle>New workspace</DialogTitle>
              <DialogDescription className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                owner access
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="thin-scrollbar min-h-0 overflow-y-auto px-4 py-4">
            <div className="grid gap-3">
              <label className="grid gap-1.5 text-sm font-medium text-[var(--ink)]">
                <span>Workspace name</span>
                <Input
                  ref={nameRef}
                  value={name}
                  onChange={(event) => handleNameChange(event.target.value)}
                  aria-invalid={Boolean(nameError)}
                  className="bg-[var(--surface-elevated)]"
                  placeholder="Acme QA"
                  disabled={isSubmitting}
                />
                {nameError ? (
                  <span className="text-xs font-medium text-[var(--danger)]">{nameError}</span>
                ) : null}
              </label>

              <label className="grid gap-1.5 text-sm font-medium text-[var(--ink)]">
                <span>Slug</span>
                <Input
                  value={slug}
                  onChange={(event) => handleSlugChange(event.target.value)}
                  aria-invalid={Boolean(slugError)}
                  className="bg-[var(--surface-elevated)] font-mono"
                  placeholder="acme-qa"
                  disabled={isSubmitting}
                />
                {slugError ? (
                  <span className="text-xs font-medium text-[var(--danger)]">{slugError}</span>
                ) : null}
              </label>

              <div className="flex items-center gap-2.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                <WorkspaceAvatar name={cleanName || 'Workspace'} active size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold leading-5 text-[var(--ink)]">
                    {cleanName || 'Workspace name'}
                  </div>
                  <div className="truncate font-mono text-[10px] text-[var(--ink-faint)]">
                    {cleanSlug || 'workspace-slug'} · owner
                  </div>
                </div>
                <Check className="h-3.5 w-3.5 text-[var(--primary)]" aria-hidden />
              </div>

              {error ? (
                <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm font-medium text-[var(--danger-strong)]">
                  {error}
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Create workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function workspaceInitial(name: string): string {
  return (name.trim() || 'W').slice(0, 1).toUpperCase();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');
}

function isValidWorkspaceSlug(value: string): boolean {
  return /^[a-z0-9-]{2,40}$/.test(value);
}

function formatCreateWorkspaceError(error: unknown, slug: string): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return `Workspace slug "${slug}" is already taken. Try another slug.`;
    }
    if (error.status === 400) {
      return error.message || 'Check the workspace name and slug.';
    }
    return error.message;
  }
  return error instanceof Error ? error.message : 'Could not create workspace. Try again.';
}

function UserMenu() {
  const auth = useAuth();

  if (!auth.user) return null;

  const initials = (auth.user.displayName ?? auth.user.email).slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full p-0 transition-transform hover:scale-105 hover:bg-transparent"
          aria-label="Account menu"
        >
          <Avatar className="h-9 w-9 rounded-full">
            <AvatarFallback className="rounded-full bg-[var(--ink)] font-mono text-[11px] font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="rounded-md bg-[var(--surface)] px-3 py-2">
          <div className="truncate text-sm font-semibold text-[var(--ink)]">
            {auth.user.displayName ?? 'Unnamed'}
          </div>
          <div className="truncate font-mono text-[11px] text-[var(--ink-faint)]">{auth.user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void auth.logout();
          }}
          className="px-3 text-[var(--ink-muted)] focus:text-[var(--ink)]"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
