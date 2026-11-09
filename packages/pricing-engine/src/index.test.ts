import { describe, expect, it } from 'vitest';
import { computeRecommendations } from './index';

describe('placeholder', () => {
  it('returns horizonDays nights', () => {
    const r = computeRecommendations({
      today: '2026-11-09',
      horizonDays: 3,
      bookings: [],
      property: {
        basePrice: 24900, minPrice: 18000, cleaningFee: 8000, platformFeePct: 0.03,
        destinationType: 'BEACH', state: 'SC', aggressiveness: 'BALANCED',
      },
    });
    expect(r).toHaveLength(3);
  });
});
