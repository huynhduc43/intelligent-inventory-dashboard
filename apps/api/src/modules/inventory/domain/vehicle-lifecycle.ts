export type VehicleStatus = 'IN_STOCK' | 'RESERVED' | 'SOLD';

const FROM: Readonly<Record<VehicleStatus, readonly VehicleStatus[]>> =
  Object.freeze({
    IN_STOCK: Object.freeze(['RESERVED'] as const),
    RESERVED: Object.freeze(['IN_STOCK'] as const),
    SOLD: Object.freeze(['IN_STOCK', 'RESERVED'] as const),
  });

/** The statuses a vehicle may move from to reach `target`; same-state is never listed, so it is a 409. */
export function allowedFrom(target: VehicleStatus): readonly VehicleStatus[] {
  return FROM[target];
}
