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
