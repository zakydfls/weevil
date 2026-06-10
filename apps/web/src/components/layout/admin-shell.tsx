'use client';

import { useEffect, useState } from 'react';
import {
  ChevronDown,
  CircleHelp,
  Grid2X2,
  Link2,
  Rows3,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const navigation = [
  { id: 'captures', label: 'Captures', icon: Grid2X2 },
  { id: 'share-links', label: 'Share Links', icon: Link2 },
  { id: 'project-board', label: 'Project Board', icon: Rows3 },
  { id: 'privacy', label: 'Privacy', icon: ShieldCheck },
] as const;

type NavigationView = (typeof navigation)[number]['id'];

function parseView(value: string | null): NavigationView {
  return navigation.some((item) => item.id === value) ? (value as NavigationView) : 'captures';
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [activeView, setActiveView] = useState('captures');

  useEffect(() => {
    function syncView() {
      setActiveView(parseView(new URLSearchParams(window.location.search).get('view')));
    }

    syncView();
    window.addEventListener('popstate', syncView);
    window.addEventListener('weevil:view-change', syncView);
    return () => {
      window.removeEventListener('popstate', syncView);
      window.removeEventListener('weevil:view-change', syncView);
    };
  }, []);

  function setView(view: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('view', view);
    url.searchParams.delete('capture');
    window.history.replaceState(null, '', url.toString());
    setActiveView(view);
    window.dispatchEvent(new CustomEvent('weevil:view-change', { detail: { view } }));
  }

  function isActive(view: string) {
    return activeView === view;
  }

  return (
    <main className="grid min-h-screen grid-cols-1 bg-[#eef3ff] text-[#16213a] lg:grid-cols-[22rem_1fr]">
      <aside className="hidden border-r border-[#dbe4f6] bg-[#f7f9ff] lg:grid lg:grid-rows-[auto_1fr_auto]">
        <div className="flex h-28 items-center px-8">
          <button type="button" className="flex w-full items-center gap-3 text-left">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#dbeafe] text-lg font-semibold text-[#2563eb]">
              W
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold">Weevil Workspace</div>
            </div>
            <ChevronDown className="h-4 w-4 text-[#64708a]" aria-hidden />
          </button>
        </div>

        <nav className="px-5">
          <div className="space-y-2">
            {navigation.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setView(item.id)}
                className={`flex h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-base transition-colors ${
                  isActive(item.id)
                    ? 'bg-[#e0ecff] font-semibold text-[#1d4ed8]'
                    : 'text-[#4b5875] hover:bg-[#edf3ff]'
                }`}
              >
                <item.icon className="h-5 w-5" aria-hidden />
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-20 border-t border-[#dbe4f6] px-4 pt-5 text-xs font-medium uppercase tracking-wide text-[#8a96ad]">
            Workspace tools
          </div>
        </nav>

        <div className="px-5 pb-6">
          <div className="mb-4 rounded-xl border border-[#dbe4f6] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-base font-medium text-[#4b5875]">Free Plan</span>
              <Button type="button" variant="secondary" size="sm" className="h-7 px-2 text-xs">
                Upgrade
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-[#dbe4f6] pt-5">
            <CircleHelp className="h-5 w-5 text-[#64708a]" aria-hidden />
            <div className="flex -space-x-2">
              {['#2563eb', '#f97316', '#84cc16'].map((color) => (
                <span
                  key={color}
                  className="h-6 w-6 rounded-full border-2 border-[#f7f9ff]"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
              ))}
            </div>
          </div>
        </div>
      </aside>

      <section className="min-h-screen p-2 lg:p-3">{children}</section>
    </main>
  );
}
