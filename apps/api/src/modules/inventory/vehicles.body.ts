import { z } from 'zod';
import { text } from '../../shared/text.js';

export const createVehicleSchema = z.strictObject({
  vin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-HJ-NPR-Z0-9]{17}$/,
      'Invalid VIN: 17 characters, letters and digits except I, O and Q',
    )
    .meta({
      description:
        'Trimmed and upper-cased before the check; 17 characters, letters and digits except I, O and Q',
    }),
  make: text().trim().min(1).max(100),
  model: text().trim().min(1).max(100),
  modelYear: z.int().min(1900).max(2100),
  mileage: z.int().min(0).max(2147483647),
  listPrice: z
    .string()
    .regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/, 'Must be a decimal string')
    .nullish(),
  stockedOn: z.iso
    .date()
    .refine((d) => d >= '1900-01-01', 'Must be 1900-01-01 or later'),
});

export const changeStatusSchema = z.strictObject({
  status: z.enum(['IN_STOCK', 'RESERVED', 'SOLD']),
});
