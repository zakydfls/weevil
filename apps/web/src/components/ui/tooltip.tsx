'use client';

import { type ReactNode } from 'react';

/**
 * Minimal hover/focus tooltip. The wrapper (not the child) owns the hover, so it
 * still shows when wrapping a disabled button (disabled elements swallow their
 * own pointer events). Purely presentational — for rich content use a popover.
 */
export function Tooltip({
  content,
  children,
  side = 'bottom',
  className = '',
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}) {
  const pos =
    side === 'top'
      ? 'bottom-full mb-2 left-1/2 -translate-x-1/2'
      : 'top-full mt-2 left-1/2 -translate-x-1/2';

  return (
    <span className={`group/tt relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-[var(--z-tooltip)] w-max max-w-[16rem] rounded-lg border border-[var(--border)] bg-[var(--ink)] px-3 py-2 text-left text-xs leading-relaxed text-white opacity-0 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)] transition-opacity duration-150 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100 ${pos}`}
      >
        {content}
      </span>
    </span>
  );
}
