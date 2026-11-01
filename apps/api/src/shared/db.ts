import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { AppConfig } from './config.js';

/** Injection token for the Drizzle database. */
export const DB = Symbol('DB');

export type Db = ReturnType<typeof createDb>;

export function createDb(
  config: Pick<AppConfig, 'DATABASE_URL' | 'DB_STATEMENT_TIMEOUT_MS'>,
) {
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    statement_timeout: config.DB_STATEMENT_TIMEOUT_MS,
    // A stopped DB fails readiness within ~2 s instead of hanging.
    connectionTimeoutMillis: 2000,
  });
  // An idle client dying (DB restart) emits 'error' on the pool; unhandled, it would crash the process.
  // The pool drops that client and the next query reconnects.
  // shortcut: the error is swallowed, not logged; log it once pino lands (next issue).
  pool.on('error', () => undefined);
  return drizzle({ client: pool });
}
