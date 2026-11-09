/**
 * Monthly seasonality curves (Jan..Dec) per destination type × region.
 * Calibrated by hand from Brazilian travel patterns; hosts can override with
 * `rules.seasonality`. Anchors from the PRD: beach South Jan 1.45 / Jul 0.75;
 * beach Northeast Jul 1.20 / Apr–May 0.85.
 */
import type { DestinationType, Region } from './types';

export type MonthlyCurve = readonly [
  number, number, number, number, number, number,
  number, number, number, number, number, number,
];

const URBAN_DEFAULT: MonthlyCurve = [0.95, 0.95, 1.0, 1.0, 1.0, 1.0, 1.02, 1.0, 1.02, 1.05, 1.02, 0.95];
const RURAL_DEFAULT: MonthlyCurve = [1.15, 1.05, 0.95, 1.0, 0.95, 1.05, 1.2, 1.0, 0.95, 1.0, 1.0, 1.1];
const CULTURAL_DEFAULT: MonthlyCurve = [1.1, 1.1, 0.95, 1.0, 0.95, 1.0, 1.15, 1.0, 1.0, 1.05, 1.0, 1.05];

export const SEASONALITY: Readonly<Record<DestinationType, Readonly<Record<Region, MonthlyCurve>>>> = {
  BEACH: {
    // Summer peak (Dec–Feb), cold and empty in winter.
    S: [1.45, 1.4, 1.1, 0.9, 0.8, 0.75, 0.75, 0.78, 0.85, 0.92, 1.0, 1.25],
    SE: [1.4, 1.3, 1.05, 0.95, 0.85, 0.85, 0.95, 0.85, 0.9, 0.95, 1.0, 1.25],
    // Summer + July (dry season, school holidays); rainy Apr–May.
    NE: [1.3, 1.2, 1.0, 0.85, 0.85, 1.0, 1.2, 1.05, 1.0, 1.05, 1.1, 1.25],
    // Northern beaches (e.g. Salinópolis, Alter do Chão): July/dry season peak.
    N: [1.1, 1.0, 0.9, 0.85, 0.9, 1.05, 1.3, 1.2, 1.05, 1.0, 1.0, 1.15],
    // River beaches (e.g. Araguaia): July peak.
    CO: [1.0, 0.95, 0.9, 0.9, 0.95, 1.1, 1.3, 1.15, 1.0, 0.95, 0.95, 1.05],
  },
  MOUNTAIN: {
    // Winter-high (Serra Gaúcha/Catarinense, Campos do Jordão); Natal Luz in Dec.
    S: [0.95, 0.95, 0.9, 0.95, 1.05, 1.3, 1.45, 1.25, 1.0, 0.95, 1.0, 1.1],
    SE: [1.0, 0.95, 0.9, 0.95, 1.05, 1.3, 1.45, 1.2, 1.0, 0.95, 0.95, 1.05],
    NE: [1.0, 0.95, 0.95, 0.95, 1.05, 1.2, 1.25, 1.1, 1.0, 0.95, 0.95, 1.05],
    // Chapadas: dry season.
    CO: [1.05, 0.95, 0.95, 1.0, 1.05, 1.1, 1.2, 1.1, 1.0, 0.95, 0.95, 1.05],
    N: [0.95, 0.9, 0.9, 0.95, 1.0, 1.05, 1.15, 1.1, 1.05, 1.0, 0.95, 1.0],
  },
  URBAN: {
    // Flat-ish: business demand dips in the Jan/Dec holidays.
    S: URBAN_DEFAULT,
    SE: URBAN_DEFAULT,
    // Northeastern capitals are also leisure destinations in summer and July.
    NE: [1.1, 1.1, 1.0, 0.95, 0.95, 1.0, 1.08, 1.0, 1.0, 1.0, 1.0, 1.08],
    CO: URBAN_DEFAULT,
    N: URBAN_DEFAULT,
  },
  RURAL: {
    S: RURAL_DEFAULT,
    SE: RURAL_DEFAULT,
    NE: RURAL_DEFAULT,
    CO: RURAL_DEFAULT,
    N: RURAL_DEFAULT,
  },
  CULTURAL: {
    S: CULTURAL_DEFAULT,
    SE: CULTURAL_DEFAULT,
    NE: CULTURAL_DEFAULT,
    CO: CULTURAL_DEFAULT,
    N: CULTURAL_DEFAULT,
  },
};

const REGION_BY_STATE: Readonly<Record<string, Region>> = {
  AC: 'N', AP: 'N', AM: 'N', PA: 'N', RO: 'N', RR: 'N', TO: 'N',
  AL: 'NE', BA: 'NE', CE: 'NE', MA: 'NE', PB: 'NE', PE: 'NE', PI: 'NE', RN: 'NE', SE: 'NE',
  DF: 'CO', GO: 'CO', MT: 'CO', MS: 'CO',
  ES: 'SE', MG: 'SE', RJ: 'SE', SP: 'SE',
  PR: 'S', RS: 'S', SC: 'S',
};

/** Region for a Brazilian UF (case-insensitive). Unknown UFs fall back to 'SE'. */
export function regionForState(uf: string): Region {
  return REGION_BY_STATE[uf.trim().toUpperCase()] ?? 'SE';
}

/**
 * Seasonality curve for a property. A host override (`rules.seasonality`) is used only
 * when it has exactly 12 finite positive numbers.
 */
export function resolveSeasonality(
  type: DestinationType,
  region: Region,
  override?: readonly number[],
): readonly number[] {
  if (override && override.length === 12 && override.every((m) => Number.isFinite(m) && m > 0)) {
    return override;
  }
  return SEASONALITY[type][region];
}

/** Seasonality multiplier for a month (0 = January). */
export function seasonalityFor(type: DestinationType, region: Region, month: number): number {
  return SEASONALITY[type][region][month] ?? 1;
}
