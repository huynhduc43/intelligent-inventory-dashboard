// Seeds the demo dealerships and users (`pnpm db:seed`). Idempotent: existing rows, and their passwords, are never changed.
// Runs with Node's type stripping, so it imports packages only (ADR 0009): the argon2id hash below repeats the app's
// PasswordService.hash on purpose; a unit test checks the app accepts it.
import { argon2, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';

const argon2Async = promisify(argon2);

/** argon2id, m=19456 KiB, t=2, p=1, 16-byte salt, 32-byte tag, as a PHC string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const tag = await argon2Async('argon2id', {
    message: password,
    nonce: salt,
    memory: 19456,
    passes: 2,
    parallelism: 1,
    tagLength: 32,
  });
  const b64 = (b: Buffer) => b.toString('base64').replaceAll('=', '');
  return `$argon2id$v=19$m=19456,t=2,p=1$${b64(salt)}$${b64(tag)}`;
}

const DEALERSHIPS = [
  ['00000000-0000-4000-8000-0000000000d1', 'London', 'Europe/London', 60, 90],
  [
    '00000000-0000-4000-8000-0000000000d2',
    'New York',
    'America/New_York',
    45,
    75,
  ],
  [
    '00000000-0000-4000-8000-0000000000d3',
    'Sydney',
    'Australia/Sydney',
    60,
    90,
  ],
] as const;

const USERS = [
  ['00000000-0000-4000-8000-0000000000a1', 'admin@example.dev', 'Admin'],
  ['00000000-0000-4000-8000-0000000000a2', 'manager@example.dev', 'Manager'],
  ['00000000-0000-4000-8000-0000000000a3', 'viewer@example.dev', 'Viewer'],
] as const;

// [user index, dealership index, role]
const MEMBERSHIPS = [
  [0, 0, 'ADMIN'],
  [0, 1, 'ADMIN'],
  [0, 2, 'ADMIN'],
  [1, 0, 'MANAGER'],
  [1, 1, 'MANAGER'],
  [2, 0, 'VIEWER'],
] as const;

// One statement per dealership. Ages are measured from the dealership-local date in SQL (never in Node), ids and VINs
// are derived from the row number, so a re-run conflicts on the primary key and adds nothing.
// Rows n = 1..4 sit at exactly watch-1, watch, aging and aging+1 days; 10% are RESERVED and 10% SOLD. The SOLD row
// n = 20 is bought back: same VIN, new row, in stock again (D18).
const SEED_VEHICLES = `
WITH d AS (
  SELECT id, timezone, watch_days, aging_days,
         (now() AT TIME ZONE timezone)::date AS today, right(id::text, 1) AS dch
  FROM dealership WHERE id = $1
), g AS (
  SELECT d.*, n,
         CASE n WHEN 1 THEN watch_days - 1 WHEN 2 THEN watch_days
                WHEN 3 THEN aging_days WHEN 4 THEN aging_days + 1
                ELSE (n * 37) % 201 END AS age,
         CASE WHEN n % 10 = 0 THEN 'SOLD' WHEN n % 10 = 5 THEN 'RESERVED' ELSE 'IN_STOCK' END AS st
  FROM d, generate_series(1, $2::int) AS n
), r AS (
  SELECT format('0000000%s-0000-4000-8000-%s', dch, lpad(to_hex(n), 12, '0'))::uuid AS id, id AS dealership_id,
         'SEED' || dch || lpad(n::text, 12, '0') AS vin,
         (ARRAY['Toyota','Ford','BMW','Kia','Tesla'])[1 + n % 5] AS make,
         (ARRAY['Corolla','Focus','X3','Ceed','Model 3'])[1 + n % 5] AS model,
         2015 + n % 10 AS model_year, (n * 1237) % 150000 AS mileage,
         CASE WHEN n % 13 = 0 THEN NULL ELSE 8000 + (n * 311) % 40000 END AS list_price,
         CASE WHEN age < 2 AND st = 'SOLD' THEN 'IN_STOCK' ELSE st END AS status,
         today - age AS stocked_on,
         CASE WHEN st = 'SOLD' AND age >= 2
              THEN ((today - age / 2)::timestamp + time '12:00') AT TIME ZONE timezone END AS sold_at,
         n, dch, today
  FROM g
)
INSERT INTO vehicle (id, dealership_id, vin, make, model, model_year, mileage, list_price,
                     status, stocked_on, sold_at, updated_by)
SELECT id, dealership_id, vin, make, model, model_year, mileage, list_price, status, stocked_on, sold_at, $3::uuid FROM r
UNION ALL
SELECT format('0000000%s-0000-4000-8000-%s', dch, 'f00000000020')::uuid, dealership_id, vin, make, model,
       model_year, mileage, list_price, 'IN_STOCK', today - 10, NULL, $3::uuid
FROM r WHERE n = 20 AND status = 'SOLD'
ON CONFLICT DO NOTHING`;

// Action history (D4): about 40% of the IN_STOCK Aging vehicles (every 5th by row number, offsets 0 and 2) get 1-3 entries,
// authored by the dealership's manager (admin where there is none). One statement per round ($2 = 1..3) so a vehicle's
// ids rise with its created_at. The selection depends on today's Aging set, so the rounds run only for a dealership with no
// action yet (issue #11 Decision 10 amendment); NOT EXISTS stays as a guard against a concurrent run.
const SEED_ACTIONS = `
WITH d AS (
  SELECT id, timezone, aging_days, (now() AT TIME ZONE timezone)::date AS today,
         (SELECT user_id FROM user_dealership WHERE dealership_id = dealership.id AND role IN ('MANAGER', 'ADMIN')
          ORDER BY (role = 'MANAGER') DESC, user_id LIMIT 1) AS author
  FROM dealership WHERE id = $1
), e AS (
  SELECT v.id, v.dealership_id, v.stocked_on, d.timezone, d.author,
         row_number() OVER (ORDER BY v.vin) AS rn
  FROM vehicle v JOIN d ON d.id = v.dealership_id
  WHERE v.status = 'IN_STOCK' AND d.today - v.stocked_on > d.aging_days
), p AS (
  SELECT *, CASE rn % 10 WHEN 0 THEN 3 WHEN 5 THEN 2 ELSE 1 END AS rounds FROM e WHERE rn % 5 IN (0, 2)
), r AS (
  SELECT id, dealership_id, author,
         (ARRAY['PRICE_REDUCTION_PLANNED','TRANSFER','AUCTION','PROMOTION','MONITOR','OTHER'])[1 + (rn + $2::int) % 6] AS action_type,
         CASE WHEN $2::int % 2 = 1 THEN 'Seed note, round ' || $2::int END AS note,
         ((stocked_on + 10 * $2::int)::timestamp + time '10:00') AT TIME ZONE timezone AS created_at
  FROM p WHERE rounds >= $2::int
)
INSERT INTO vehicle_action (vehicle_id, dealership_id, action_type, note, created_by, created_at)
SELECT id, dealership_id, action_type, note, author, created_at FROM r
WHERE author IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM vehicle_action a WHERE a.vehicle_id = r.id AND a.action_type = r.action_type AND a.created_at = r.created_at)`;

/** Returns the password of each user this run inserted (none on a re-run); `report` gets one line per dealership. */
export async function seed(
  client: pg.ClientBase,
  fixedPassword?: string,
  vehiclesPerDealership = 250,
  report: (line: string) => void = () => undefined,
): Promise<{ email: string; password: string }[]> {
  if (fixedPassword !== undefined && fixedPassword.length < 15) {
    throw new Error('SEED_PASSWORD must be at least 15 characters');
  }
  for (const [id, name, timezone, watch, aging] of DEALERSHIPS) {
    await client.query(
      `INSERT INTO dealership (id, name, timezone, watch_days, aging_days)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [id, name, timezone, watch, aging],
    );
  }
  const created: { email: string; password: string }[] = [];
  for (const [id, email, displayName] of USERS) {
    const password = fixedPassword ?? randomBytes(18).toString('base64url');
    const res = await client.query(
      `INSERT INTO app_user (id, email, display_name, password_hash)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [id, email, displayName, await hashPassword(password)],
    );
    if (res.rowCount) created.push({ email, password });
  }
  for (const [u, d, role] of MEMBERSHIPS) {
    await client.query(
      `INSERT INTO user_dealership (user_id, dealership_id, role)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [USERS[u][0], DEALERSHIPS[d][0], role],
    );
  }
  for (const [dealershipId, name] of DEALERSHIPS) {
    const vehicles = await client.query(SEED_VEHICLES, [
      dealershipId,
      vehiclesPerDealership,
      USERS[0][0],
    ]);
    const added = `${name}: ${String(vehicles.rowCount ?? 0)} vehicles added`;
    const seeded = await client.query(
      'SELECT 1 FROM vehicle_action WHERE dealership_id = $1 LIMIT 1',
      [dealershipId],
    );
    if (seeded.rowCount) {
      report(`${added}, actions skipped (the dealership already has some)`);
      continue;
    }
    let actions = 0;
    for (const round of [1, 2, 3]) {
      actions +=
        (await client.query(SEED_ACTIONS, [dealershipId, round])).rowCount ?? 0;
    }
    report(`${added}, ${String(actions)} actions added`);
  }
  return created;
}

if (import.meta.main) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write('DATABASE_URL is required\n');
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const fixed = process.env.SEED_PASSWORD;
    const raw = process.env.SEED_VEHICLES_PER_DEALERSHIP;
    const count = raw === undefined || raw === '' ? 250 : Number(raw);
    if (!Number.isInteger(count) || count < 0 || count > 1_000_000) {
      throw new Error(
        'SEED_VEHICLES_PER_DEALERSHIP must be an integer from 0 to 1000000',
      );
    }
    const created = await seed(
      client,
      fixed === '' ? undefined : fixed,
      count,
      (line) => process.stdout.write(`${line}\n`),
    );
    for (const { email, password } of created) {
      process.stdout.write(`${email}  ${password}\n`);
    }
    process.stdout.write(
      created.length
        ? 'New users seeded (passwords printed once)\n'
        : 'No new users\n',
    );
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
