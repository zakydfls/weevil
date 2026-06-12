'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Inbox,
  KanbanSquare,
  LayoutGrid,
  Plus,
  Search,
  Settings,
  Terminal,
} from 'lucide-react';
import { useReports } from '@/features/reports/queries';
import { startExtensionCapture } from '@/lib/extension-bridge';

type CommandKind = 'view' | 'capture' | 'action';

interface CommandItem {
  id: string;
  kind: CommandKind;
  label: string;
  hint?: string;
  icon: typeof Inbox;
  perform: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const reportsQuery = useReports({ page: 1, pageSize: 24, search: query.trim() || undefined });
  const reports = reportsQuery.data?.items ?? [];

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (isCmdK) {
        event.preventDefault();
        setIsOpen((value) => !value);
        return;
      }
      if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        setIsOpen(false);
      }
    }

    function handleOpenEvent() {
      setIsOpen(true);
    }

    window.addEventListener('keydown', handleKey);
    window.addEventListener('weevil:open-command-palette', handleOpenEvent);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('weevil:open-command-palette', handleOpenEvent);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const items = useMemo<CommandItem[]>(() => {
    const normalized = query.trim().toLowerCase();
    const viewItems: CommandItem[] = [
      {
        id: 'view-captures',
        kind: 'view',
        label: 'Browse captures',
        hint: 'Latest captures grid',
        icon: LayoutGrid,
        perform: () => router.push('/captures'),
      },
      {
        id: 'view-board',
        kind: 'view',
        label: 'Project board',
        icon: KanbanSquare,
        perform: () => router.push('/board'),
      },
      {
        id: 'view-settings',
        kind: 'view',
        label: 'Open settings',
        icon: Settings,
        perform: () => router.push('/settings'),
      },
    ];

    const actionItems: CommandItem[] = [
      {
        id: 'action-new-capture',
        kind: 'action',
        label: 'Start new capture',
        hint: 'Triggers the browser extension',
        icon: Plus,
        perform: () => {
          void startExtensionCapture({ redactSensitiveData: true }).catch(() => undefined);
        },
      },
    ];

    const captureItems: CommandItem[] = reports.slice(0, 6).map((report) => ({
      id: `capture-${report.id}`,
      kind: 'capture',
      label: report.title,
      hint: report.pageUrl ?? report.id,
      icon: Terminal,
      perform: () => router.push(`/c/${report.id}`),
    }));

    const all = [...viewItems, ...actionItems, ...captureItems];
    if (normalized.length === 0) {
      return all;
    }
    return all.filter((item) => {
      const haystack = `${item.label} ${item.hint ?? ''}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [query, reports, router]);

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(items.length - 1, 0)));
  }, [items.length]);

  function execute(item: CommandItem) {
    setIsOpen(false);
    item.perform();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((current) => Math.min(current + 1, items.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[selectedIndex];
      if (item) execute(item);
    }
  }

  if (!isOpen) {
    return null;
  }

  const groups = (
    [
      { id: 'view', label: 'Go to', items: items.filter((item) => item.kind === 'view') },
      { id: 'action', label: 'Actions', items: items.filter((item) => item.kind === 'action') },
      { id: 'capture', label: 'Captures', items: items.filter((item) => item.kind === 'capture') },
    ] as Array<{ id: CommandKind; label: string; items: CommandItem[] }>
  ).filter((group) => group.items.length > 0);

  let globalIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] grid items-start justify-items-center bg-[var(--ink-strong)]/40 px-4 pt-24 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] shadow-[0_24px_60px_-20px_rgba(26,29,18,0.35)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3.5 py-2.5">
          <Search className="h-4 w-4 text-[var(--ink-faint)]" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
            placeholder="Search captures, jump to a view…"
            aria-label="Search"
          />
          <kbd className="inline-flex items-center rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-px font-mono text-[10px] text-[var(--ink-faint)]">
            esc
          </kbd>
        </div>
        <div className="thin-scrollbar max-h-[60vh] min-h-[10rem] overflow-auto py-2">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--ink-faint)]">
              Nothing matches <span className="font-mono text-[var(--ink-muted)]">{query}</span>.
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="mb-1.5 last:mb-0">
                <div className="px-3.5 pb-1 pt-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">
                  {group.label}
                </div>
                {group.items.map((item) => {
                  globalIndex += 1;
                  const active = globalIndex === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setSelectedIndex(globalIndex)}
                      onClick={() => execute(item)}
                      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors ${
                        active ? 'bg-[var(--primary-subtle)]' : 'bg-transparent'
                      }`}
                    >
                      <item.icon className="h-3.5 w-3.5 shrink-0 text-[var(--ink-muted)]" aria-hidden />
                      <span className="flex-1 truncate text-sm text-[var(--ink)]">{item.label}</span>
                      {item.hint ? (
                        <span className="truncate font-mono text-[11px] text-[var(--ink-faint)]">{item.hint}</span>
                      ) : null}
                      <ArrowRight
                        className={`h-3.5 w-3.5 shrink-0 transition-opacity ${active ? 'opacity-100 text-[var(--primary)]' : 'opacity-0'}`}
                        aria-hidden
                      />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 font-mono text-[10px] text-[var(--ink-faint)]">
          <span>
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg)] px-1">↑</kbd>{' '}
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg)] px-1">↓</kbd> navigate
          </span>
          <span>
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg)] px-1">↵</kbd> open
          </span>
          <span>
            <kbd className="rounded border border-[var(--border)] bg-[var(--bg)] px-1">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
