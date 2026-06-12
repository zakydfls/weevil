import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const controlClass =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--ink)] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-[var(--ink-faint)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-subtle)]';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, 'h-9', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, 'min-h-24 py-2', className)} {...props} />;
}
