import {
  bucketOf,
  tierOf,
  toStockedOnBounds,
  validateThresholds,
} from '../../../src/modules/inventory/domain/aging-policy.js';

describe('tierOf', () => {
  const thresholds = { watch: 60, aging: 90 };

  it.each([
    [0, 'FRESH'],
    [59, 'FRESH'],
    [60, 'WATCH'],
    [90, 'WATCH'],
    [91, 'AGING'],
  ] as const)('%i days is %s', (days, tier) => {
    expect(tierOf(days, thresholds)).toBe(tier);
  });
});

describe('bucketOf', () => {
  it.each([
    [0, '0-30'],
    [30, '0-30'],
    [31, '31-60'],
    [60, '31-60'],
    [61, '61-90'],
    [90, '61-90'],
    [91, '90+'],
  ] as const)('%i days is %s', (days, bucket) => {
    expect(bucketOf(days)).toBe(bucket);
  });
});

describe('toStockedOnBounds', () => {
  const t = { watch: 60, aging: 90 };
  const today = '2026-11-02';
  // Day n before today.
  const ago = (n: number) =>
    new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000)
      .toISOString()
      .slice(0, 10);

  it('returns no bounds without a filter', () => {
    expect(toStockedOnBounds(today, {}, t)).toEqual({});
  });

  it('bounds AGING at aging+1 days and older', () => {
    expect(toStockedOnBounds(today, { tier: 'AGING' }, t)).toEqual({
      stockedOnMax: ago(91),
    });
  });

  it('bounds WATCH between aging and watch days, inclusive', () => {
    expect(toStockedOnBounds(today, { tier: 'WATCH' }, t)).toEqual({
      stockedOnMin: ago(90),
      stockedOnMax: ago(60),
    });
  });

  it('bounds FRESH at watch-1 days and newer', () => {
    expect(toStockedOnBounds(today, { tier: 'FRESH' }, t)).toEqual({
      stockedOnMin: ago(59),
    });
  });

  it('turns min and max age into opposite bounds', () => {
    expect(
      toStockedOnBounds(today, { minAgeDays: 30, maxAgeDays: 45 }, t),
    ).toEqual({ stockedOnMin: ago(45), stockedOnMax: ago(30) });
    expect(toStockedOnBounds(today, { minAgeDays: 0 }, t)).toEqual({
      stockedOnMax: today,
    });
  });

  it('intersects a tier with an age range, tightest bound winning', () => {
    expect(
      toStockedOnBounds(
        today,
        { tier: 'WATCH', minAgeDays: 70, maxAgeDays: 100 },
        t,
      ),
    ).toEqual({ stockedOnMin: ago(90), stockedOnMax: ago(70) });
    expect(
      toStockedOnBounds(
        today,
        { tier: 'WATCH', minAgeDays: 50, maxAgeDays: 80 },
        t,
      ),
    ).toEqual({ stockedOnMin: ago(80), stockedOnMax: ago(60) });
  });

  it('gives min > max for a contradictory pair', () => {
    const b = toStockedOnBounds(today, { tier: 'FRESH', minAgeDays: 100 }, t);
    expect(b.stockedOnMin).toBe(ago(59));
    expect(b.stockedOnMax).toBe(ago(100));
    expect(ago(59) > ago(100)).toBe(true);
  });

  it('crosses month, year and leap-day boundaries by calendar day', () => {
    expect(toStockedOnBounds('2024-03-01', { minAgeDays: 1 }, t)).toEqual({
      stockedOnMax: '2024-02-29',
    });
    expect(toStockedOnBounds('2026-01-01', { minAgeDays: 1 }, t)).toEqual({
      stockedOnMax: '2025-12-31',
    });
  });
});

describe('validateThresholds', () => {
  it.each([
    [0, 90, false],
    [1, 90, true],
    [60, 3650, true],
    [60, 3651, false],
    [90, 90, false],
    [89, 90, true],
    [60.5, 90, false],
    [100, 60, false],
  ])('watch %s aging %s -> %s', (watch, aging, ok) => {
    expect(validateThresholds({ watch, aging })).toBe(ok);
  });
});
