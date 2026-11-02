import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { type AppConfig, loadConfig } from '../../../src/shared/config.js';

// Same pinned tag as docker-compose.yml.
const IMAGE = 'postgres:17.11-alpine';
const MIGRATIONS = `${import.meta.dirname}/../../../db/migrations`;

/** Starts a throwaway Postgres with the committed migrations applied. */
export async function startMigratedPostgres(): Promise<StartedPostgreSqlContainer> {
  const container = await new PostgreSqlContainer(IMAGE).start();
  const db = drizzle(container.getConnectionUri());
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await db.$client.end();
  return container;
}

export function testConfig(
  databaseUrl: string,
  overrides: Record<string, string> = {},
): AppConfig {
  return loadConfig({
    DATABASE_URL: databaseUrl,
    JWT_SECRET: 'test-secret-test-secret-test-secret',
    LOG_LEVEL: 'silent',
    ...overrides,
  });
}
