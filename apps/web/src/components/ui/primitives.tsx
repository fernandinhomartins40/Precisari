'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Minus, Moon, Plus, Sun } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { t } from '@/i18n';
import { THEME_STORAGE_KEY } from '@/lib/theme-css';
import { IconButton } from './button';
import s from './ui.module.css';

// ---------- Logo ----------
/** Brand logo: principal on light surfaces, negativa (tangerina) on navy/dark. `auto` follows the theme. */
export function Logo({ tone = 'auto', width = 168, href, priority }: { tone?: 'auto' | 'light' | 'dark'; width?: number; href?: string; priority?: boolean }) {
  const height = Math.round((width * 95) / 420);
  const light = <Image className={s.logoOnLight} src="/brand/logo-principal.png" alt={t('common.logoAlt')} width={width} height={height} priority={priority} />;
  const dark = <Image className={s.logoOnDark} src="/brand/logo-negativa-tangerina.png" alt={t('common.logoAlt')} width={width} height={height} priority={priority} />;
  const content = tone === 'light' ? light : tone === 'dark' ? dark : (
    <>
      {light}
      {dark}
    </>
  );
  const cls = [s.logo, tone === 'auto' ? s.logoAuto : ''].join(' ');
  return href ? (
    <Link href={href} className={cls} aria-label={t('common.appName')}>
      {content}
    </Link>
  ) : (
    <span className={cls}>{content}</span>
  );
}

// ---------- Theme toggle ----------
function currentTheme(): 'light' | 'dark' {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);
  useEffect(() => setTheme(currentTheme()), []);
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <IconButton
      className={className}
      label={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
      onClick={() => {
        document.documentElement.setAttribute('data-theme', next);
        try {
          localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
          /* private mode */
        }
        setTheme(next);
      }}
    >
      {theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
    </IconButton>
  );
}

// ---------- Badge ----------
export type BadgeTone = 'accent' | 'hot' | 'positive' | 'neutral' | 'danger' | 'inverse';
const toneClass: Record<BadgeTone, string | undefined> = {
  accent: s.badgeAccent,
  hot: s.badgeHot,
  positive: s.badgePositive,
  neutral: s.badgeNeutral,
  danger: s.badgeDanger,
  inverse: s.badgeInverse,
};
export function Badge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={[s.badge, toneClass[tone], className].filter(Boolean).join(' ')}>{children}</span>;
}

// ---------- Card ----------
export function Card({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={[s.card, className].filter(Boolean).join(' ')} {...rest} />;
}

// ---------- Field ----------
interface FieldProps extends Omit<ComponentProps<'input'>, 'prefix'> {
  label: string;
  hint?: string;
  error?: string | null;
  prefix?: string;
  suffix?: ReactNode;
  hideLabel?: boolean;
}

export function Field({ label, hint, error, prefix, suffix, hideLabel, id, className, ...rest }: FieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errId = error ? `${inputId}-err` : undefined;
  return (
    <div className={[s.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={inputId} className={hideLabel ? 'visually-hidden' : s.label}>
        {label}
      </label>
      <div className={s.inputWrap} data-invalid={error ? 'true' : undefined}>
        {prefix ? (
          <span className={s.prefix} aria-hidden="true">
            {prefix}
          </span>
        ) : null}
        <input
          id={inputId}
          className={s.input}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errId].filter(Boolean).join(' ') || undefined}
          {...rest}
        />
        {suffix}
      </div>
      {hint ? (
        <span id={hintId} className={s.hint}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errId} className={s.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function SelectField({ label, children, id, hint, ...rest }: ComponentProps<'select'> & { label: string; hint?: string }) {
  const auto = useId();
  const selectId = id ?? auto;
  return (
    <div className={s.field}>
      <label htmlFor={selectId} className={s.label}>
        {label}
      </label>
      <select id={selectId} className={s.select} {...rest}>
        {children}
      </select>
      {hint ? <span className={s.hint}>{hint}</span> : null}
    </div>
  );
}

// ---------- Switch ----------
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={s.switchRow}>
      <div className={s.switchText}>
        <span id={`${id}-l`} className={s.label}>
          {label}
        </span>
        {description ? (
          <span id={`${id}-d`} className={s.hint}>
            {description}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={description ? `${id}-d` : undefined}
        className={s.switch}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

// ---------- Segmented (radiogroup) ----------
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.filter((o) => !o.disabled);
  const move = (dir: 1 | -1) => {
    const idx = enabled.findIndex((o) => o.value === value);
    const next = enabled[(idx + dir + enabled.length) % enabled.length];
    if (next) {
      onChange(next.value);
      refs.current[options.indexOf(next)]?.focus();
    }
  };
  return (
    <div role="radiogroup" aria-label={label} className={[s.segmented, className].filter(Boolean).join(' ')}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          disabled={o.disabled}
          className={s.segment}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              move(1);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              move(-1);
            }
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Dialog ----------
export function Dialog({ open, onClose, title, children, actions }: { open: boolean; onClose: () => void; title: string; children?: ReactNode; actions: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={s.dialog} aria-labelledby={titleId} onClose={onClose} onCancel={onClose}>
      {open ? (
        <div className={s.dialogBody}>
          <h2 id={titleId}>{title}</h2>
          {children}
          <div className={s.dialogActions}>{actions}</div>
        </div>
      ) : null}
    </dialog>
  );
}

// ---------- Number stepper ----------
export function NumberStepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const id = useId();
  return (
    <div className={s.field}>
      <span id={id} className={s.label}>
        {label}
      </span>
      <div className={s.stepper} role="group" aria-labelledby={id}>
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`${t('onboarding.prices.decrease')}: ${label}`}>
          <Minus size={18} aria-hidden="true" />
        </button>
        <output className={s.stepperValue} aria-live="polite">
          {value}
        </output>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`${t('onboarding.prices.increase')}: ${label}`}>
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ---------- Skeleton / states ----------
export function Skeleton({ height, width = '100%', className }: { height: string; width?: string; className?: string }) {
  return <div className={[s.skeleton, className].filter(Boolean).join(' ')} style={{ height, width }} aria-hidden="true" />;
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className={s.state}>
      <div className={s.stateIcon} aria-hidden="true">
        {icon}
      </div>
      <h2>{title}</h2>
      {text ? <p className={s.stateText}>{text}</p> : null}
      {action}
    </div>
  );
}
