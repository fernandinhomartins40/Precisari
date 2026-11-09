import { ptBR, type Dictionary } from './pt-BR';

type Join<K extends string, P extends string> = `${K}.${P}`;

/** Dot paths to string leaves, e.g. "today.review". */
export type TKey<T = Dictionary> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends readonly string[]
      ? never
      : T[K] extends object
        ? Join<K, TKey<T[K]>>
        : never;
}[keyof T & string];

/** Dot paths to string-array leaves, e.g. "weekdays.short". */
export type TListKey<T = Dictionary> = {
  [K in keyof T & string]: T[K] extends readonly string[]
    ? K
    : T[K] extends string
      ? never
      : T[K] extends object
        ? Join<K, TListKey<T[K]>>
        : never;
}[keyof T & string];

export type TParams = Record<string, string | number>;

const dict: Dictionary = ptBR;

function lookup(path: string): unknown {
  let node: unknown = dict;
  for (const part of path.split('.')) {
    if (node && typeof node === 'object' && part in node) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return node;
}

export function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Typed translation. Missing keys return the key itself (visible in dev). */
export function t(key: TKey, params?: TParams): string {
  const v = lookup(key);
  return typeof v === 'string' ? interpolate(v, params) : key;
}

export function tList(key: TListKey): readonly string[] {
  const v = lookup(key);
  return Array.isArray(v) ? (v as string[]) : [];
}

export const locale = 'pt-BR';
