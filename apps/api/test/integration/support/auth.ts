import type { INestApplication, Type } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import type { App } from 'supertest/types.js';
import { seed } from '../../../db/seed.js';
import { AppModule } from '../../../src/app.module.js';
import { configureApp } from '../../../src/configure-app.js';
import { Clock } from '../../../src/shared/clock.js';
import { testConfig } from './postgres.js';

export const SEED_PASSWORD = 'seed-password-12345';
export const SECRET = 'test-secret-test-secret-test-secret';

/** Ids and dealerships from db/seed.ts. */
export const ADMIN = '00000000-0000-4000-8000-0000000000a1';
export const MANAGER = '00000000-0000-4000-8000-0000000000a2';
export const VIEWER = '00000000-0000-4000-8000-0000000000a3';
export const LONDON = '00000000-0000-4000-8000-0000000000d1';
export const NEW_YORK = '00000000-0000-4000-8000-0000000000d2';
export const SYDNEY = '00000000-0000-4000-8000-0000000000d3';

export class TestClock extends Clock {
  constructor(public current = new Date('2026-07-01T12:00:00Z')) {
    super();
  }
  now() {
    return this.current;
  }
}

export async function seedDatabase(url: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await seed(client, SEED_PASSWORD);
  } finally {
    await client.end();
  }
}

export async function buildApp(
  url: string,
  clock: Clock,
  controllers: Type[] = [],
  logDestination?: NodeJS.WritableStream,
): Promise<INestApplication<App>> {
  const config = testConfig(url, logDestination ? { LOG_LEVEL: 'info' } : {});
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(config, logDestination)],
    controllers,
  })
    .overrideProvider(Clock)
    .useValue(clock)
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app, config, logDestination);
  await app.init();
  return app;
}

/** A token the app accepts, minted without a login (the login endpoint is throttled). */
export function tokenFor(
  sub: string,
  clock: Clock,
  overrides: Record<string, unknown> = {},
  algorithm: 'HS256' | 'HS512' = 'HS256',
): string {
  const iat = Math.floor(clock.now().getTime() / 1000);
  return new JwtService({ secret: SECRET }).sign(
    {
      sub,
      iat,
      exp: iat + 3600,
      iss: 'inventory-api',
      aud: 'inventory-dashboard',
      ...overrides,
    },
    { algorithm },
  );
}
