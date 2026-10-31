import {
  bucketOf,
  tierOf,
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
