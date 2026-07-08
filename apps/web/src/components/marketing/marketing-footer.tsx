import Link from 'next/link';
import { WeevilMark } from '@/components/brand/weevil-mark';

export function MarketingFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-2.5">
          <WeevilMark size={22} tone="ink" />
          <span className="text-sm font-semibold text-[var(--ink)]">Weevil</span>
          <span className="text-sm text-[var(--ink-faint)]">— bug evidence, board ownership, fewer rituals.</span>
        </div>

        <nav className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <Link href="/#why" className="text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]">
            Why Weevil
          </Link>
          <Link href="/#workflow" className="text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]">
            Workflow
          </Link>
          <Link href="/#board" className="text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]">
            Board
          </Link>
          <Link href="/#extension" className="text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]">
            Extension
          </Link>
          <Link href="/support" className="text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]">
            Support
          </Link>
          <Link href="/privacy" className="text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]">
            Privacy
          </Link>
          <Link href="/login" className="text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]">
            Sign in
          </Link>
        </nav>
      </div>
      <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-1 border-t border-[var(--divider)] px-4 py-6 sm:px-6">
        <p className="text-xs text-[var(--ink-faint)]">© 2026 Weevil. Squash bugs, not each other.</p>
      </div>
    </footer>
  );
}
