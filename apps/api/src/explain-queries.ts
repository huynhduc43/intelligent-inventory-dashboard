// Prints EXPLAIN (ANALYZE, BUFFERS) of the exact SQL the vehicle list and the dashboard send (`pnpm db:explain`, README
// "Performance evidence"). It calls the real services with a drizzle logger that records each statement, then replays
// every recorded SELECT through the same pool: pg sends parameterised queries as unnamed prepared statements, which
// Postgres plans with the actual values, so the replay gets the app's plan. Run it on a seeded database.
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { DealershipContext } from './modules/auth/request-context.js';
import { DashboardService } from './modules/dashboard/dashboard.query.js';
import { VehiclesService } from './modules/inventory/vehicles.service.js';
import { vehicleListQuery } from './modules/inventory/vehicles.query.js';
import { SystemClock } from './shared/clock.js';

const LONDON = '00000000-0000-4000-8000-0000000000d1';
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const out = (s: string) => process.stdout.write(`${s}\n`);
const recorded: { text: string; params: unknown[] }[] = [];
const pool = new Pool({ connectionString: url });
const db = drizzle({
  client: pool,
  logger: { logQuery: (text, params) => recorded.push({ text, params }) },
});
const clock = new SystemClock();

// The same context query DealershipGuard runs, so today_local is computed in Postgres.
const { rows } = await db.execute<{
  timezone: string;
  watch_days: number;
  aging_days: number;
  today_local: string;
}>(sql`
  SELECT timezone, watch_days, aging_days,
         ((${clock.now().toISOString()}::timestamptz AT TIME ZONE timezone)::date)::text AS today_local
  FROM dealership WHERE id = ${LONDON}`);
const d = rows[0];
if (!d) throw new Error('London dealership not found: run db:seed first');
const ctx: DealershipContext = {
  role: 'ADMIN',
  timezone: d.timezone,
  watchDays: d.watch_days,
  agingDays: d.aging_days,
  todayLocal: d.today_local,
};

const vehicles = new VehiclesService(db, clock);
const dashboard = new DashboardService(db, clock);
const list = (q: Record<string, string>) => () =>
  vehicles.list(LONDON, ctx, vehicleListQuery.parse(q));
const cases: [string, () => Promise<unknown>][] = [
  ['List: default (IN_STOCK, oldest first, limit 50)', list({})],
  ['List: tier=AGING', list({ tier: 'AGING' })],
  [
    'List: make=Toyota&model=Corolla',
    list({ make: 'Toyota', model: 'Corolla' }),
  ],
  [
    'List: tier=AGING&hasAction=false',
    list({ tier: 'AGING', hasAction: 'false' }),
  ],
  ['Dashboard', () => dashboard.get(LONDON, ctx)],
];

await pool.query('ANALYZE vehicle, vehicle_action');
const version = await pool.query<{ server_version: string }>(
  'SHOW server_version',
);
out(
  `Postgres ${version.rows[0]?.server_version ?? '?'}, dealership London, today_local ${ctx.todayLocal}`,
);
for (const [name, run] of cases) {
  await run(); // warm-up
  recorded.length = 0;
  await run();
  const selects = recorded.filter((r) => /^\s*select/i.test(r.text));
  if (selects.length === 0) throw new Error(`${name}: no SELECT recorded`);
  for (const [i, s] of selects.entries()) {
    const plan = await pool.query<{ 'QUERY PLAN': string }>({
      text: `EXPLAIN (ANALYZE, BUFFERS) ${s.text}`,
      values: s.params,
    });
    out(
      `\n=== ${name} (statement ${String(i + 1)} of ${String(selects.length)})`,
    );
    out(plan.rows.map((r) => r['QUERY PLAN']).join('\n'));
  }
}
await pool.end();
