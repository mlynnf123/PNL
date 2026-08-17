import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button as ShadButton, buttonVariants } from '@/components/shadcn/button';
import { cn } from '@/lib/utils';

// Our app's button API, kept stable, now rendered by the shadcn/Radix button so
// every button gets consistent theming, focus rings, and press states.
export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANT_MAP: Record<ButtonVariant, 'default' | 'outline' | 'destructive'> = {
  primary: 'default',
  accent: 'default',
  secondary: 'outline',
  danger: 'destructive',
};
const SIZE_MAP: Record<ButtonSize, 'sm' | 'default'> = { sm: 'sm', md: 'default' };

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
    <ShadButton variant={VARIANT_MAP[variant]} size={SIZE_MAP[size]} className={className} {...props}>
      {children}
    </ShadButton>
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
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant: VARIANT_MAP[variant], size: SIZE_MAP[size] }),
        className,
      )}
    >
      {children}
    </Link>
  );
}
