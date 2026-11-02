import { z } from 'zod';
import { text } from '../../shared/text.js';

const STATUSES = ['IN_STOCK', 'RESERVED', 'SOLD'] as const;

// Strict digits only: `offset=`, `limit=1e2` and `0x10` are 400, never silently coerced (issue #9, C1).
const integer = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/, 'Must be a non-negative integer')
    .transform(Number)
    .pipe(z.number().int().min(min).max(max))
    .meta({ type: 'integer', minimum: min, maximum: max });

const filter = text().min(1).max(100);

export const vehicleListQuery = z
  .strictObject({
    status: z
      .string()
      .transform((s) => s.split(','))
      .pipe(z.array(z.enum(STATUSES)).min(1))
      .default(['IN_STOCK'])
      .meta({
        description:
          'Comma-separated list of IN_STOCK, RESERVED, SOLD. Default IN_STOCK.',
      }),
    make: filter.optional().meta({ description: 'Case-insensitive, exact.' }),
    model: filter.optional().meta({ description: 'Case-insensitive, exact.' }),
    tier: z.enum(['FRESH', 'WATCH', 'AGING']).optional(),
    minAgeDays: integer(0, 36500).optional(),
    maxAgeDays: integer(0, 36500).optional(),
    hasAction: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional()
      .meta({ description: 'Whether any action was ever logged.' }),
    sort: z.enum(['oldest', 'newest']).default('oldest'),
    limit: integer(1, 100).default(50).meta({ description: 'Default 50.' }),
    offset: integer(0, Number.MAX_SAFE_INTEGER)
      .default(0)
      .meta({ description: 'Default 0.' }),
  })
  .superRefine((q, ctx) => {
    // Age filters measure age to today, which a SOLD vehicle's frozen age does not follow (decision 4).
    if (q.status.includes('SOLD')) {
      for (const key of ['tier', 'minAgeDays', 'maxAgeDays'] as const) {
        if (q[key] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} cannot be combined with status SOLD`,
          });
        }
      }
    }
    if (
      q.minAgeDays !== undefined &&
      q.maxAgeDays !== undefined &&
      q.minAgeDays > q.maxAgeDays
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['minAgeDays'],
        message: 'minAgeDays must not exceed maxAgeDays',
      });
    }
  });

export type VehicleListQuery = z.infer<typeof vehicleListQuery>;
