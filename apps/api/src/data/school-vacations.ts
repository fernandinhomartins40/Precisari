/**
 * School vacations per state — ESTIMATES for 2026 and 2027, to be curated in /admin/school-vacations (RF-81)
 * once each state's education department publishes its calendar. Public state networks only.
 *
 * Pattern used (approximate):
 *  - Summer: mid/late December → late January / early February (South returns mid-February).
 *  - Winter: July (Northeast starts late June around São João; North keeps most of July).
 * `year` = the year the vacation STARTS.
 */
import type { BrazilState } from '@precisari/shared';

type Region = 'S' | 'SE' | 'CO' | 'NE' | 'N';

const REGION: Record<BrazilState, Region> = {
  PR: 'S', SC: 'S', RS: 'S',
  SP: 'SE', RJ: 'SE', MG: 'SE', ES: 'SE',
  DF: 'CO', GO: 'CO', MT: 'CO', MS: 'CO',
  BA: 'NE', SE: 'NE', AL: 'NE', PE: 'NE', PB: 'NE', RN: 'NE', CE: 'NE', PI: 'NE', MA: 'NE',
  AM: 'N', PA: 'N', AC: 'N', RO: 'N', RR: 'N', AP: 'N', TO: 'N',
};

/** [start, end] per region and year (start year). */
const WINDOWS: Record<Region, Record<number, { winter: [string, string]; summer: [string, string] }>> = {
  S: {
    2026: { winter: ['2026-07-11', '2026-07-26'], summer: ['2026-12-19', '2027-02-14'] },
    2027: { winter: ['2027-07-10', '2027-07-25'], summer: ['2027-12-18', '2028-02-13'] },
  },
  SE: {
    2026: { winter: ['2026-07-04', '2026-07-26'], summer: ['2026-12-19', '2027-02-01'] },
    2027: { winter: ['2027-07-03', '2027-07-25'], summer: ['2027-12-18', '2028-01-31'] },
  },
  CO: {
    2026: { winter: ['2026-07-01', '2026-07-26'], summer: ['2026-12-19', '2027-01-31'] },
    2027: { winter: ['2027-07-01', '2027-07-25'], summer: ['2027-12-18', '2028-01-30'] },
  },
  NE: {
    2026: { winter: ['2026-06-27', '2026-07-19'], summer: ['2026-12-19', '2027-01-31'] },
    2027: { winter: ['2027-06-26', '2027-07-18'], summer: ['2027-12-18', '2028-01-30'] },
  },
  N: {
    2026: { winter: ['2026-07-01', '2026-07-31'], summer: ['2026-12-19', '2027-01-31'] },
    2027: { winter: ['2027-07-01', '2027-07-31'], summer: ['2027-12-18', '2028-01-30'] },
  },
};

export interface SchoolVacationSeed {
  state: BrazilState;
  startDate: string;
  endDate: string;
  year: number;
}

export const SCHOOL_VACATION_YEARS = [2026, 2027] as const;

export function schoolVacationSeeds(): SchoolVacationSeed[] {
  const out: SchoolVacationSeed[] = [];
  for (const [state, region] of Object.entries(REGION) as [BrazilState, Region][]) {
    for (const year of SCHOOL_VACATION_YEARS) {
      const w = WINDOWS[region][year];
      if (!w) continue;
      out.push({ state, startDate: w.winter[0], endDate: w.winter[1], year });
      out.push({ state, startDate: w.summer[0], endDate: w.summer[1], year });
    }
  }
  return out;
}
