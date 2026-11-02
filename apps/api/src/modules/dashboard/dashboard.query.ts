import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Clock } from '../../shared/clock.js';
import { DB, type Db } from '../../shared/db.js';
import type { DealershipContext } from '../auth/request-context.js';

const BUCKETS = ['0-30', '31-60', '61-90', '90+'] as const;
const ACTION_TYPES = [
  'NONE',
  'PRICE_REDUCTION_PLANNED',
  'TRANSFER',
  'AUCTION',
  'PROMOTION',
  'MONITOR',
  'OTHER',
] as const;

export interface Dashboard {
  asOf: string;
  timezone: string;
  thresholds: { watchDays: number; agingDays: number };
  summary: {
    totalInStock: number;
    byTier: { FRESH: number; WATCH: number; AGING: number };
    agingWithoutAction: number;
    avgDaysInStock: number | null;
  };
  ageBuckets: { bucket: (typeof BUCKETS)[number]; count: number }[];
  byMakeModel: { make: string; model: string; count: number; aging: number }[];
  actionStats: { actionType: (typeof ACTION_TYPES)[number]; count: number }[];
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  async get(dealershipId: string, ctx: DealershipContext): Promise<Dashboard> {
    const today = sql`${ctx.todayLocal}::date`;
    // Days in stock = today_local - stocked_on, same tier boundaries as tierOf (D3) and buckets as bucketOf (D10).
    const days = sql`(${today} - v.stocked_on)`;
    const aging = sql`${days} > ${ctx.agingDays}::int`;
    const inStock = sql`v.dealership_id = ${dealershipId} AND v.status = 'IN_STOCK'`;

    // One snapshot: the three statements must agree with each other (Decision 2).
    const { summary, makeModel, actions } = await this.db.transaction(
      async (tx) => {
        const s = await tx.execute<Record<string, string | number | null>>(sql`
          SELECT count(*)::int AS total,
            count(*) FILTER (WHERE ${days} < ${ctx.watchDays}::int)::int AS fresh,
            count(*) FILTER (WHERE ${days} >= ${ctx.watchDays}::int AND NOT (${aging}))::int AS watch,
            count(*) FILTER (WHERE ${aging})::int AS aging,
            count(*) FILTER (WHERE ${aging} AND NOT EXISTS (
              SELECT 1 FROM vehicle_action a WHERE a.vehicle_id = v.id AND a.dealership_id = v.dealership_id))::int AS aging_without_action,
            round(avg(${days})::numeric, 1)::float8 AS avg_days,
            count(*) FILTER (WHERE ${days} <= 30)::int AS b0,
            count(*) FILTER (WHERE ${days} BETWEEN 31 AND 60)::int AS b1,
            count(*) FILTER (WHERE ${days} BETWEEN 61 AND 90)::int AS b2,
            count(*) FILTER (WHERE ${days} > 90)::int AS b3
          FROM vehicle v WHERE ${inStock}`);
        const m = await tx.execute<{
          make: string;
          model: string;
          count: number;
          aging: number;
        }>(sql`
          SELECT v.make, v.model, count(*)::int AS count, count(*) FILTER (WHERE ${aging})::int AS aging
          FROM vehicle v WHERE ${inStock}
          GROUP BY v.make, v.model ORDER BY count DESC, v.make, v.model`);
        // Read-only LATERAL on vehicle_action for the latest action by id (ADR 0011).
        const a = await tx.execute<{ action_type: string; count: number }>(sql`
          SELECT coalesce(la.action_type, 'NONE') AS action_type, count(*)::int AS count
          FROM vehicle v
          LEFT JOIN LATERAL (
            SELECT a.action_type FROM vehicle_action a
            WHERE a.vehicle_id = v.id AND a.dealership_id = v.dealership_id ORDER BY a.id DESC LIMIT 1
          ) la ON true
          WHERE ${inStock} GROUP BY 1`);
        return { summary: s.rows[0], makeModel: m.rows, actions: a.rows };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );

    const n = (k: string) => Number(summary?.[k] ?? 0);
    const total = n('total');
    const byAction = new Map(actions.map((r) => [r.action_type, r.count]));
    return {
      asOf: this.clock.now().toISOString(),
      timezone: ctx.timezone,
      thresholds: { watchDays: ctx.watchDays, agingDays: ctx.agingDays },
      summary: {
        totalInStock: total,
        byTier: { FRESH: n('fresh'), WATCH: n('watch'), AGING: n('aging') },
        agingWithoutAction: n('aging_without_action'),
        avgDaysInStock: total === 0 ? null : Number(summary?.avg_days),
      },
      ageBuckets: BUCKETS.map((bucket, i) => ({
        bucket,
        count: n('b' + String(i)),
      })),
      byMakeModel: makeModel,
      actionStats: ACTION_TYPES.map((actionType) => ({
        actionType,
        count: byAction.get(actionType) ?? 0,
      })),
    };
  }
}
