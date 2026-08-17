import type { ReactNode, SelectHTMLAttributes } from 'react';
import type { ComponentProps } from 'react';
import { Input as ShadInput } from '@/components/shadcn/input';
import { Textarea as ShadTextarea } from '@/components/shadcn/textarea';
import { cn } from '@/lib/utils';

// Form controls on shadcn primitives (real focus rings + theme tokens). Input
// and Textarea are drop-in wrappers; Select stays a native <select> (many call
// sites depend on the native API) styled to match the shadcn input.
export function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Input(props: ComponentProps<'input'>) {
  return <ShadInput {...props} />;
}

export function Textarea(props: ComponentProps<'textarea'>) {
  return <ShadTextarea {...props} />;
}

const SELECT_CLASS =
  'flex h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50';

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(SELECT_CLASS, props.className)} />;
}
