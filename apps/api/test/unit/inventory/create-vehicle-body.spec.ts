import { createVehicleSchema } from '../../../src/modules/inventory/vehicles.body.js';

const ok = {
  vin: '1HGCM82633A004352',
  make: 'Honda',
  model: 'Accord',
  modelYear: 2021,
  mileage: 1,
  stockedOn: '2026-06-26',
};

describe('createVehicleSchema vin', () => {
  it('trims and upper-cases', () => {
    const r = createVehicleSchema.parse({ ...ok, vin: ' 1hgcm82633a004352 ' });

    expect(r.vin).toBe('1HGCM82633A004352');
  });

  it.each([
    ['16 chars', '1HGCM82633A00435'],
    ['18 chars', '1HGCM82633A0043522'],
    ['I', '1HGCM82633A00435I'],
    ['O', '1HGCM82633A00435O'],
    ['Q', '1HGCM82633A00435Q'],
  ])('rejects %s with an issue at vin', (_n, vin) => {
    const r = createVehicleSchema.safeParse({ ...ok, vin });

    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['vin']);
  });
});
