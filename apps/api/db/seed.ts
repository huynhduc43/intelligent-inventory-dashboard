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

/** Returns the password of each user this run inserted (none on a re-run). */
export async function seed(
  client: pg.ClientBase,
  fixedPassword?: string,
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
    const created = await seed(client, fixed === '' ? undefined : fixed);
    for (const { email, password } of created) {
      process.stdout.write(`${email}  ${password}\n`);
    }
    process.stdout.write(
      created.length
        ? 'Seeded (passwords printed once)\n'
        : 'Nothing to seed\n',
    );
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
