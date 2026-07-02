'use client';

import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '@/lib/utils';

const ToggleGroup = forwardRef<
  ElementRef<typeof ToggleGroupPrimitive.Root>,
  ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(function ToggleGroup({ className, ...props }, ref) {
  return (
    <ToggleGroupPrimitive.Root
      ref={ref}
      className={cn('inline-flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5', className)}
      {...props}
    />
  );
});

const ToggleGroupItem = forwardRef<
  ElementRef<typeof ToggleGroupPrimitive.Item>,
  ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(function ToggleGroupItem({ className, ...props }, ref) {
  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn(
        'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-[var(--ink-muted)] outline-none transition-[background-color,color,box-shadow] hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-[var(--bg)] data-[state=on]:text-[var(--primary)] data-[state=on]:shadow-[0_0_0_1px_var(--border)]',
        className,
      )}
      {...props}
    />
  );
});

export { ToggleGroup, ToggleGroupItem };
