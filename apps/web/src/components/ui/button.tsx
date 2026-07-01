import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]',
        secondary:
          'border border-[var(--border-strong)] bg-transparent text-[var(--ink)] hover:bg-[var(--primary-subtle)] hover:border-[var(--primary)]',
        ghost:
          'bg-transparent text-[var(--ink)] hover:bg-[var(--primary-subtle)]',
        danger:
          'bg-[var(--danger)] text-[var(--danger-foreground)] hover:bg-[var(--danger-strong)]',
        accent:
          'bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)]',
      },
      size: {
        default: 'h-9 px-3.5',
        icon: 'h-9 w-9 px-0',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-5 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { asChild = false, className, variant, size, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
