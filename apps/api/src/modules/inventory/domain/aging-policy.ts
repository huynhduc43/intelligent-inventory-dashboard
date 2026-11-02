// Pure: no I/O, no time zones. `days` is whole calendar days, computed by Postgres (design doc P1).
export type Tier = 'FRESH' | 'WATCH' | 'AGING';
export type AgeBucket = '0-30' | '31-60' | '61-90' | '90+';

export interface Thresholds {
  watch: number;
  aging: number;
}

// FRESH < watch ≤ WATCH ≤ aging < AGING (D3).
export const tierOf = (days: number, t: Thresholds): Tier =>
  days > t.aging ? 'AGING' : days >= t.watch ? 'WATCH' : 'FRESH';

// Fixed buckets, independent of the thresholds (D10).
export const bucketOf = (days: number): AgeBucket =>
  days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';

export interface AgeFilter {
  tier?: Tier | undefined;
  minAgeDays?: number | undefined;
  maxAgeDays?: number | undefined;
}

export interface StockedOnBounds {
  stockedOnMin?: string;
  stockedOnMax?: string;
}

// Calendar-date arithmetic on a plain `YYYY-MM-DD` (UTC is only the carrier); no time zone is involved.
const minusDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000)
    .toISOString()
    .slice(0, 10);

/**
 * Turns tier and age filters into inclusive `stocked_on` bounds, given the dealership-local date.
 * Tier and age range intersect; a contradictory pair yields min > max, i.e. no rows. Valid only for vehicles
 * whose age runs to today (not SOLD).
 */
export function toStockedOnBounds(
  todayLocal: string,
  filter: AgeFilter,
  t: Thresholds,
): StockedOnBounds {
  const mins: string[] = [];
  const maxs: string[] = [];
  if (filter.minAgeDays !== undefined)
    maxs.push(minusDays(todayLocal, filter.minAgeDays));
  if (filter.maxAgeDays !== undefined)
    mins.push(minusDays(todayLocal, filter.maxAgeDays));
  if (filter.tier === 'AGING') maxs.push(minusDays(todayLocal, t.aging + 1));
  if (filter.tier === 'WATCH') {
    mins.push(minusDays(todayLocal, t.aging));
    maxs.push(minusDays(todayLocal, t.watch));
  }
  if (filter.tier === 'FRESH') mins.push(minusDays(todayLocal, t.watch - 1));
  // ISO dates sort as strings: the latest minimum and the earliest maximum are the tightest.
  const stockedOnMin = mins.sort().at(-1);
  const stockedOnMax = maxs.sort()[0];
  return {
    ...(stockedOnMin && { stockedOnMin }),
    ...(stockedOnMax && { stockedOnMax }),
  };
}
