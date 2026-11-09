import { describe, expect, it } from 'vitest';
import { buildCssVariables, darkColors, heatBucket, lightColors } from './index';

describe('design tokens', () => {
  it('buckets heat', () => {
    expect(heatBucket(-1)).toBe(0);
    expect(heatBucket(0.1)).toBe(0);
    expect(heatBucket(0.3)).toBe(1);
    expect(heatBucket(0.5)).toBe(2);
    expect(heatBucket(0.7)).toBe(3);
    expect(heatBucket(2)).toBe(4);
  });
  it('light and dark themes expose the same keys', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });
  it('generates css variables for both themes', () => {
    const css = buildCssVariables();
    expect(css).toContain('--color-accent: #FF8845;');
    expect(css).toContain("[data-theme='dark']");
    expect(css).toContain('--color-heat-4');
  });
});
