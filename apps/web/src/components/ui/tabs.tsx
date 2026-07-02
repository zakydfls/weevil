'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1',
        className,
      )}
      {...props}
    />
  );
});

const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-[var(--ink-muted)] outline-none transition-[background-color,color,box-shadow] hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-[var(--surface-elevated)] data-[state=active]:text-[var(--ink)] data-[state=active]:shadow-[0_1px_2px_rgb(26_29_18_/_0.06)]',
        className,
      )}
      {...props}
    />
  );
});

const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn('outline-none data-[state=active]:weevil-step-enter', className)}
      {...props}
    />
  );
});

export { Tabs, TabsContent, TabsList, TabsTrigger };
