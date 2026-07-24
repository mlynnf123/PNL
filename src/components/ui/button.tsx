import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

// Reference button styles: one dominant primary (slate-800), a teal accent for
// positive/CTA actions, a bordered secondary, and a red danger.
export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-slate-800 text-white hover:bg-slate-900',
  accent: 'bg-teal-600 text-white hover:bg-teal-700',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

function classes(variant: ButtonVariant, size: ButtonSize, extra = ''): string {
  return `inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${extra}`;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={classes(variant, size, className)} {...props}>
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  className = '',
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={classes(variant, size, className)}>
      {children}
    </Link>
  );
}
