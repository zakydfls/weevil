import { Slot } from '@radix-ui/react-slot';
import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { asChild?: boolean }>(function Card(
  { asChild = false, className, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'div';
  return (
    <Comp
      ref={ref}
      className={cn(
        'rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--ink)]',
        className,
      )}
      {...props}
    />
  );
});

const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('grid gap-1.5 border-b border-[var(--divider)] px-5 py-4', className)}
        {...props}
      />
    );
  },
);

const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <h2
        ref={ref}
        className={cn('text-base font-semibold tracking-[-0.01em] text-[var(--ink)]', className)}
        {...props}
      />
    );
  },
);

const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...props }, ref) {
    return (
      <p ref={ref} className={cn('text-sm leading-6 text-[var(--ink-muted)]', className)} {...props} />
    );
  },
);

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn('px-5 py-4', className)} {...props} />;
  },
);

const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('border-t border-[var(--divider)] px-5 py-3', className)}
        {...props}
      />
    );
  },
);

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
