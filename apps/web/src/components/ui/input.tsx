import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const controlClass =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--ink)] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-[var(--ink-faint)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-subtle)]';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(controlClass, 'h-9', className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(controlClass, 'min-h-24 py-2', className)} {...props} />;
  },
);
