import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, type SQL, sql } from 'drizzle-orm';
import { DB, type Db } from '../../shared/db.js';
import { Clock } from '../../shared/clock.js';
import { CodedHttpException } from '../../shared/problem.js';
import type { DealershipContext } from '../auth/request-context.js';
import { type Tier, tierOf, toStockedOnBounds } from './domain/aging-policy.js';
import type { VehicleListQuery } from './vehicles.query.js';

export interface Vehicle {
  id: string;
  vin: string;
  make: string;
  model: string;
  modelYear: number;
  mileage: number;
  listPrice: string | null;
  status: 'IN_STOCK' | 'RESERVED' | 'SOLD';
  stockedOn: string;
  daysInStock: number;
  tier: Tier;
  currentAction: {
    actionType: string;
    note: string | null;
    createdBy: string;
    createdAt: string;
  } | null;
}

export interface NewVehicle {
  vin: string;
  make: string;
  model: string;
  modelYear: number;
  mileage: number;
  listPrice?: string | null;
  stockedOn: string;
}

interface Row extends Record<string, unknown> {
  id: string;
  vin: string;
  make: string;
  model: string;
  model_year: number;
  mileage: number;
  list_price: string | null;
  status: Vehicle['status'];
  stocked_on: string;
  days_in_stock: number;
  action_type: string | null;
  action_note: string | null;
  action_created_by: string | null;
  action_created_at: string | null;
  total?: number;
}

// Read-only LATERAL on vehicle_action for the latest action by id (ADR 0011).
const latestAction = sql`LEFT JOIN LATERAL (
  SELECT a.action_type, a.note, a.created_by, a.created_at
  FROM vehicle_action a WHERE a.vehicle_id = v.id AND a.dealership_id = v.dealership_id ORDER BY a.id DESC LIMIT 1
) la ON true`;

@Injectable()
export class VehiclesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  /** One conditional INSERT, no lock: 0 rows means an unsold vehicle already has the VIN (409). */
  async create(
    dealershipId: string,
    userId: string,
    ctx: DealershipContext,
    v: NewVehicle,
  ): Promise<Vehicle> {
    const { rows } = await this.db.execute<{ id: string }>(sql`
      INSERT INTO vehicle (dealership_id, vin, make, model, model_year, mileage, list_price, stocked_on, updated_by, created_at, updated_at)
      VALUES (${dealershipId}, ${v.vin}, ${v.make}, ${v.model}, ${v.modelYear}, ${v.mileage}, ${v.listPrice ?? null}::numeric,
        ${v.stockedOn}::date, ${userId}::uuid, ${this.clock.now().toISOString()}::timestamptz, ${this.clock.now().toISOString()}::timestamptz)
      ON CONFLICT (dealership_id, vin) WHERE status <> 'SOLD' DO NOTHING
      RETURNING id`);
    const created = rows[0];
    if (!created)
      throw new CodedHttpException(
        409,
        'VIN_ALREADY_IN_STOCK',
        `VIN ${v.vin} is already on an unsold vehicle in this dealership.`,
      );
    return this.get(dealershipId, ctx, created.id);
  }

  /** `today_local` and the time zone come from DealershipGuard; a SOLD vehicle's age stops at the local date of `sold_at`. */
  private columns(ctx: DealershipContext): SQL {
    return sql`v.id, v.vin, v.make, v.model, v.model_year, v.mileage, v.list_price, v.status,
      v.stocked_on::text AS stocked_on,
      (CASE WHEN v.status = 'SOLD' THEN (v.sold_at AT TIME ZONE ${ctx.timezone}::text)::date
            ELSE ${ctx.todayLocal}::date END - v.stocked_on) AS days_in_stock,
      la.action_type, la.note AS action_note, la.created_by AS action_created_by,
      to_char(la.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS action_created_at`;
  }

  private toVehicle(r: Row, ctx: DealershipContext): Vehicle {
    return {
      id: r.id,
      vin: r.vin,
      make: r.make,
      model: r.model,
      modelYear: r.model_year,
      mileage: r.mileage,
      listPrice: r.list_price,
      status: r.status,
      stockedOn: r.stocked_on,
      daysInStock: r.days_in_stock,
      tier: tierOf(r.days_in_stock, {
        watch: ctx.watchDays,
        aging: ctx.agingDays,
      }),
      currentAction:
        r.action_type && r.action_created_by && r.action_created_at
          ? {
              actionType: r.action_type,
              note: r.action_note,
              createdBy: r.action_created_by,
              createdAt: r.action_created_at,
            }
          : null,
    };
  }

  async list(
    dealershipId: string,
    ctx: DealershipContext,
    q: VehicleListQuery,
  ): Promise<{ items: Vehicle[]; total: number }> {
    // Not applied with SOLD (the query schema rejects the combination), so ages here all run to today.
    const { stockedOnMin, stockedOnMax } = toStockedOnBounds(
      ctx.todayLocal,
      q,
      { watch: ctx.watchDays, aging: ctx.agingDays },
    );
    const where = and(
      sql`v.dealership_id = ${dealershipId}`,
      sql`v.status = ANY(${sql.param(q.status)}::text[])`,
      q.make === undefined ? undefined : sql`lower(v.make) = lower(${q.make})`,
      q.model === undefined
        ? undefined
        : sql`lower(v.model) = lower(${q.model})`,
      stockedOnMin === undefined
        ? undefined
        : sql`v.stocked_on >= ${stockedOnMin}::date`,
      stockedOnMax === undefined
        ? undefined
        : sql`v.stocked_on <= ${stockedOnMax}::date`,
      q.hasAction === undefined
        ? undefined
        : q.hasAction
          ? sql`la.action_type IS NOT NULL`
          : sql`la.action_type IS NULL`,
    );
    // Two fixed fragments: an interpolated direction would be a bind parameter, not SQL.
    const order =
      q.sort === 'newest'
        ? sql`v.stocked_on DESC, v.id DESC`
        : sql`v.stocked_on, v.id`;
    const { rows } = await this.db.execute<Row>(sql`
      SELECT ${this.columns(ctx)}, count(*) OVER ()::int AS total
      FROM vehicle v ${latestAction}
      WHERE ${where}
      ORDER BY ${order}
      LIMIT ${q.limit} OFFSET ${q.offset}`);
    let total = rows[0]?.total ?? 0;
    // The window yields no total when the page is past the end.
    if (rows.length === 0 && q.offset > 0) {
      const counted = await this.db.execute<{ total: number }>(sql`
        SELECT count(*)::int AS total FROM vehicle v ${latestAction} WHERE ${where}`);
      total = counted.rows[0]?.total ?? 0;
    }
    return { items: rows.map((r) => this.toVehicle(r, ctx)), total };
  }

  async get(
    dealershipId: string,
    ctx: DealershipContext,
    vehicleId: string,
  ): Promise<Vehicle> {
    const { rows } = await this.db.execute<Row>(sql`
      SELECT ${this.columns(ctx)}
      FROM vehicle v ${latestAction}
      WHERE v.id = ${vehicleId} AND v.dealership_id = ${dealershipId}`);
    const row = rows[0];
    if (!row) throw new NotFoundException('Resource not found.');
    return this.toVehicle(row, ctx);
  }
}
