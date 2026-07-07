'use client';

import { type ReactNode } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

/**
 * Hover/focus tooltip built on Radix so content escapes clipping ancestors
 * (scrollable panels, overflow-hidden cards) via a portal, and repositions
 * itself automatically near a viewport edge instead of running off it.
 */
export function Tooltip({
  content,
  children,
  side = 'bottom',
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <span className={cn('inline-flex', className)}>{children}</span>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={8}
            collisionPadding={8}
            className="weevil-fade-in z-[var(--z-tooltip)] max-w-[16rem] rounded-lg border border-[var(--border)] bg-[var(--ink)] px-3 py-2 text-left text-xs leading-relaxed text-white shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)]"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-[var(--ink)]" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
