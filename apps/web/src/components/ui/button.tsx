import Link from 'next/link';
import type { ComponentProps } from 'react';
import s from './ui.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'inverse' | 'ghost' | 'danger' | 'dangerOutline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', block = false, extra?: string): string {
  return [s.btn, s[variant], size !== 'md' ? s[size] : '', block ? s.block : '', extra ?? ''].filter(Boolean).join(' ');
}

interface Common {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
}

export function Button({ variant, size, block, loading, className, children, disabled, type = 'button', ...rest }: Common & ComponentProps<'button'>) {
  return (
    <button type={type} className={buttonClass(variant, size, block, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className={s.spinner} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, block, className, children, ...rest }: Omit<Common, 'loading'> & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClass(variant, size, block, className)} {...rest}>
      {children}
    </Link>
  );
}

export function IconButton({ className, label, children, type = 'button', ...rest }: ComponentProps<'button'> & { label: string }) {
  return (
    <button type={type} aria-label={label} title={label} className={[s.iconBtn, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <span className={s.spinner} role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
