import { describe, expect, it } from 'vitest';
import { formatPct, interpolate, messages, t, tc } from './index';

function leaves(node: unknown, path = ''): [string, string][] {
  if (typeof node === 'string') return [[path, node]];
  if (Array.isArray(node)) return node.flatMap((n, i) => leaves(n, `${path}[${i}]`));
  if (node && typeof node === 'object') return Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  return [];
}

describe('i18n', () => {
  it('translates and interpolates', () => {
    expect(t('landing.hero.titleHighlight')).toBe('preço certo.');
    expect(t('login.codeSubtitle', { email: 'a@b.com' })).toBe('Enviamos um código de 6 dígitos para a@b.com.');
    expect(interpolate('{a} e {b}', { a: 1 })).toBe('1 e {b}');
  });
  it('handles plurals', () => {
    expect(tc('today.potentialCount', 1)).toBe('1 sugestão para revisar');
    expect(tc('today.potentialCount', 3)).toBe('3 sugestões para revisar');
    expect(tc('common.nights', 2)).toBe('2 noites');
  });
  it('formats percentages in pt-BR', () => {
    expect(formatPct(0.72)).toBe('72%');
  });
  it('has no empty strings and never mentions WhatsApp', () => {
    for (const [path, value] of leaves(messages)) {
      expect(value.trim(), path).not.toBe('');
      if (!/WhatsApp/.test(value)) continue;
      // Only allowed as a negative statement ("nada de WhatsApp").
      expect(value.toLowerCase(), path).toContain('nada de whatsapp');
    }
  });
  it('keeps calendar arrays complete', () => {
    expect(messages.weekdays.short).toHaveLength(7);
    expect(messages.months.long).toHaveLength(12);
    expect(messages.calendar.heat).toHaveLength(5);
  });
});
