import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Clock } from '../../shared/clock.js';
import { DB, type Db } from '../../shared/db.js';
import { CodedHttpException } from '../../shared/problem.js';
import { validateThresholds } from '../inventory/domain/aging-policy.js';
import type { DealershipContext } from '../auth/request-context.js';

export interface Settings {
  name: string;
  timezone: string;
  watchDays: number;
  agingDays: number;
  todayLocal: string;
}

export interface SettingsPatch {
  timezone?: string | undefined;
  watchDays?: number | undefined;
  agingDays?: number | undefined;
}

interface Row extends Record<string, unknown> {
  name: string;
  timezone: string;
  watch_days: number;
  aging_days: number;
  today_local: string;
}

const toSettings = (r: Row): Settings => ({
  name: r.name,
  timezone: r.timezone,
  watchDays: r.watch_days,
  agingDays: r.aging_days,
  todayLocal: r.today_local,
});

const thresholdsInvalid = () =>
  new CodedHttpException(
    422,
    'THRESHOLDS_INVALID',
    'watchDays must be at least 1, less than agingDays, and agingDays at most 3650.',
  );

// Drizzle wraps the pg error: the SQLSTATE and constraint sit on `.cause`.
const isThresholdsCheck = (e: unknown) => {
  const c = (e as { cause?: { code?: string; constraint?: string } }).cause;
  return c?.code === '23514' && c.constraint === 'dealership_thresholds_chk';
};

@Injectable()
export class SettingsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  async get(dealershipId: string, ctx: DealershipContext): Promise<Settings> {
    const { rows } = await this.db.execute<{ name: string }>(
      sql`SELECT name FROM dealership WHERE id = ${dealershipId}`,
    );
    return {
      name: rows[0]?.name ?? '',
      timezone: ctx.timezone,
      watchDays: ctx.watchDays,
      agingDays: ctx.agingDays,
      todayLocal: ctx.todayLocal,
    };
  }

  /** One conditional UPDATE, no lock: 0 rows means the time zone failed ADR 0015's check (the guard proved the dealership). */
  async update(
    dealershipId: string,
    ctx: DealershipContext,
    patch: SettingsPatch,
  ): Promise<Settings> {
    if (
      !validateThresholds({
        watch: patch.watchDays ?? ctx.watchDays,
        aging: patch.agingDays ?? ctx.agingDays,
      })
    )
      throw thresholdsInvalid();
    const now = this.clock.now().toISOString();
    const tz = patch.timezone ?? null;
    let rows: Row[];
    try {
      // Time zones are validated in Postgres only: exact name in pg_timezone_names, and not also an abbreviation.
      ({ rows } = await this.db.execute<Row>(sql`
        UPDATE dealership SET
          timezone = COALESCE(${tz}::text, timezone),
          watch_days = COALESCE(${patch.watchDays ?? null}::smallint, watch_days),
          aging_days = COALESCE(${patch.agingDays ?? null}::smallint, aging_days)
        WHERE id = ${dealershipId}
          AND (${tz}::text IS NULL OR (
            EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = ${tz}::text)
            AND NOT EXISTS (SELECT 1 FROM pg_timezone_abbrevs WHERE abbrev = ${tz}::text)))
        RETURNING name, timezone, watch_days, aging_days,
          ((${now}::timestamptz AT TIME ZONE timezone)::date)::text AS today_local`));
    } catch (e) {
      if (isThresholdsCheck(e)) throw thresholdsInvalid();
      throw e;
    }
    const row = rows[0];
    if (!row)
      throw new CodedHttpException(
        422,
        'TIMEZONE_INVALID',
        'timezone must be an IANA time-zone name such as Europe/London; abbreviations are not accepted.',
      );
    return toSettings(row);
  }
}
