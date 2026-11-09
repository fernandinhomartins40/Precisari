import { ptBR, type Messages } from './pt-BR';

export const messages: Messages = ptBR;
export const locale = 'pt-BR';

type Plural = { readonly one: string; readonly other: string };
type Vars = Record<string, string | number>;

/** Dot-paths of string leaves. */
type StringPaths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends readonly unknown[]
      ? never
      : T[K] extends Plural
        ? never
        : StringPaths<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Dot-paths of plural leaves ({ one, other }). */
type PluralPaths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? never
    : T[K] extends readonly unknown[]
      ? never
      : T[K] extends Plural
        ? `${P}${K}`
        : PluralPaths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = StringPaths<Messages>;
export type PluralKey = PluralPaths<Messages>;

function lookup(key: string): unknown {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in node) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return node;
}

export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Translate a key, interpolating `{vars}`. Falls back to the key when missing (never throws in UI). */
export function t(key: MessageKey, vars?: Vars): string {
  const v = lookup(key);
  return typeof v === 'string' ? interpolate(v, vars) : key;
}

const pluralRules = new Intl.PluralRules(locale);

/** Plural translation: `{count}` is always available. */
export function tc(key: PluralKey, count: number, vars?: Vars): string {
  const v = lookup(key) as Plural | undefined;
  if (!v) return key;
  const form = pluralRules.select(count) === 'one' ? v.one : v.other;
  return interpolate(form, { count: formatNumber(count), ...vars });
}

export function formatNumber(n: number, maxFractionDigits = 0): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits }).format(n);
}

/** 0.68 → "68%". */
export function formatPct(fraction: number, maxFractionDigits = 0): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: maxFractionDigits }).format(fraction);
}
