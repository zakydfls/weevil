'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { WeevilMark } from '@/components/brand/weevil-mark';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';

// Anchors are prefixed with `/` (not bare `#...`) so they work from any page,
// not just the landing page itself — Next's <Link> navigates to `/` first
// and then scrolls to the section, instead of silently no-op'ing when the
// current page has no element with that id.
const NAV_LINKS = [
  { href: '/#why', label: 'Why Weevil' },
  { href: '/#workflow', label: 'Workflow' },
  { href: '/#board', label: 'Board' },
  { href: '/#extension', label: 'Extension' },
  { href: '/support', label: 'Support' },
];

export function MarketingNav() {
  const auth = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isAuthed = auth.status === 'authenticated';

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 8);
    }
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [auth.status]);

  return (
    <header
      className={`sticky top-0 z-40 transition-colors duration-300 ${
        scrolled || menuOpen
          ? 'border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-[82rem] items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2">
          <WeevilMark
            size={30}
            tone="primary"
            className="shrink-0 transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:-rotate-6 group-hover:scale-110"
          />
          <span className="text-base font-semibold text-[var(--ink)]">Weevil</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="weevil-nav-link text-sm font-medium text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {isAuthed ? (
            <Button asChild size="sm" className="weevil-button-pop hidden sm:inline-flex">
              <Link href="/captures">Open dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="weevil-button-pop hidden sm:inline-flex">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="weevil-button-pop hidden sm:inline-flex">
                <Link href="/signup">Get started</Link>
              </Button>
            </>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="grid h-9 w-9 place-items-center rounded-lg text-[var(--ink)] transition-colors hover:bg-[var(--primary-subtle)] md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav className="weevil-mobile-menu border-t border-[var(--border)] bg-[var(--bg)] px-4 py-4 md:hidden">
          <ul className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--ink-muted)] transition-colors hover:bg-[var(--primary-subtle)] hover:text-[var(--ink)]"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-2 border-t border-[var(--divider)] pt-3 sm:hidden">
            {isAuthed ? (
              <Button asChild size="sm">
                <Link href="/captures">Open dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/signup">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
