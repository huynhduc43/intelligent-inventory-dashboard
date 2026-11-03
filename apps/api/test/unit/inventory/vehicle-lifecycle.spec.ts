import {
  allowedFrom,
  type VehicleStatus,
} from '../../../src/modules/inventory/domain/vehicle-lifecycle.js';

const ALL: VehicleStatus[] = ['IN_STOCK', 'RESERVED', 'SOLD'];
const LEGAL = new Set([
  'RESERVED>IN_STOCK',
  'IN_STOCK>RESERVED',
  'IN_STOCK>SOLD',
  'RESERVED>SOLD',
]);

describe('allowedFrom', () => {
  it.each(ALL.flatMap((from) => ALL.map((to) => [from, to] as const)))(
    '%s -> %s',
    (from, to) => {
      expect(allowedFrom(to).includes(from)).toBe(LEGAL.has(`${from}>${to}`));
    },
  );
});
