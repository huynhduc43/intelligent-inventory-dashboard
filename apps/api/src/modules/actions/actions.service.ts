import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Clock } from '../../shared/clock.js';
import { DB, type Db } from '../../shared/db.js';
import { CodedHttpException } from '../../shared/problem.js';

export const ACTION_TYPES = [
  'PRICE_REDUCTION_PLANNED',
  'TRANSFER',
  'AUCTION',
  'PROMOTION',
  'MONITOR',
  'OTHER',
] as const;

export interface Action {
  id: number;
  actionType: (typeof ACTION_TYPES)[number];
  note: string | null;
  createdBy: string;
  createdAt: string;
}

interface Row extends Record<string, unknown> {
  id: number | string;
  action_type: Action['actionType'];
  note: string | null;
  created_by: string;
  created_at: string;
}

const toAction = (r: Row): Action => ({
  id: Number(r.id),
  actionType: r.action_type,
  note: r.note,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

const createdAt = sql`to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

@Injectable()
export class ActionsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  /** One conditional statement, no lock (ADR 0013): 0 rows means the vehicle is missing (404) or not IN_STOCK (409). */
  async log(
    dealershipId: string,
    userId: string,
    vehicleId: string,
    input: { actionType: Action['actionType']; note?: string | null },
  ): Promise<Action> {
    // The body schema has already trimmed the note.
    const note =
      input.note === undefined || input.note === '' ? null : input.note;
    const { rows } = await this.db.execute<Row>(sql`
      INSERT INTO vehicle_action (vehicle_id, dealership_id, action_type, note, created_by, created_at)
      SELECT v.id, v.dealership_id, ${input.actionType}, ${note}, ${userId}::uuid, ${this.clock.now().toISOString()}::timestamptz
      FROM vehicle v
      WHERE v.id = ${vehicleId} AND v.dealership_id = ${dealershipId} AND v.status = 'IN_STOCK'
      RETURNING id, action_type, note, created_by, ${createdAt} AS created_at`);
    if (rows[0]) return toAction(rows[0]);
    const found = await this.db.execute<{ status: string }>(
      sql`SELECT status FROM vehicle WHERE id = ${vehicleId} AND dealership_id = ${dealershipId}`,
    );
    if (!found.rows[0]) throw new NotFoundException('Resource not found.');
    throw new CodedHttpException(
      409,
      'VEHICLE_NOT_IN_STOCK',
      `Vehicle is ${found.rows[0].status}; an action can only be logged on an IN_STOCK vehicle.`,
    );
  }

  // shortcut: the whole history in one response, no paging; add limit/offset when a vehicle collects hundreds of actions (§6).
  async list(
    dealershipId: string,
    vehicleId: string,
  ): Promise<{ items: Action[] }> {
    const { rows } = await this.db.execute<Row & { aid: number | null }>(sql`
      SELECT a.id AS aid, a.id, a.action_type, a.note, a.created_by,
             to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
      FROM vehicle v LEFT JOIN vehicle_action a ON a.vehicle_id = v.id
      WHERE v.id = ${vehicleId} AND v.dealership_id = ${dealershipId}
      ORDER BY a.id DESC`);
    if (rows.length === 0) throw new NotFoundException('Resource not found.');
    return { items: rows.filter((r) => r.aid !== null).map(toAction) };
  }
}
