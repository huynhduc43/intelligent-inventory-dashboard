import type { INestApplication } from '@nestjs/common';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { startMigratedPostgres } from './support/postgres.js';
import {
  ADMIN,
  buildApp,
  LONDON,
  MANAGER,
  NEW_YORK,
  seedDatabase,
  TestClock,
  tokenFor,
  VIEWER,
} from './support/auth.js';
import { expectProblem } from './support/problem.js';

const NOW = '2026-03-10T03:30:00.000Z';

describe('dealership settings', { timeout: 30_000 }, () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication<App>;
  let db: pg.Client;
  const clock = new TestClock(new Date(NOW));
  const url = (d = LONDON) => `/api/v1/dealerships/${d}/settings`;
  const auth = (r: request.Test, user: string | null) =>
    user ? r.set('Authorization', `Bearer ${tokenFor(user, clock)}`) : r;
  const get = (user: string | null = VIEWER, d = LONDON) =>
    auth(request(app.getHttpServer()).get(url(d)), user);
  const patch = (body: unknown, user: string | null = ADMIN, d = LONDON) =>
    auth(request(app.getHttpServer()).patch(url(d)), user).send(body as object);
  const row = async (d = LONDON) =>
    (
      await db.query<{
        timezone: string;
        watch_days: number;
        aging_days: number;
      }>(
        'SELECT timezone, watch_days, aging_days FROM dealership WHERE id = $1',
        [d],
      )
    ).rows[0];

  beforeAll(async () => {
    container = await startMigratedPostgres();
    await seedDatabase(container.getConnectionUri());
    db = new pg.Client({ connectionString: container.getConnectionUri() });
    await db.connect();
    app = await buildApp(container.getConnectionUri(), clock);
  });

  beforeEach(async () => {
    await db.query(
      `UPDATE dealership SET timezone = 'Europe/London', watch_days = 60, aging_days = 90 WHERE id = $1`,
      [LONDON],
    );
  });

  afterAll(async () => {
    await app.close();
    await db.end();
    await container.stop();
  });

  it.each([ADMIN, MANAGER, VIEWER])(
    'GET returns the settings to %s',
    async (u) => {
      const res = await get(u);

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({
        name: expect.any(String) as string,
        timezone: 'Europe/London',
        watchDays: 60,
        agingDays: 90,
        todayLocal: '2026-03-10',
      });
    },
  );

  it('computes todayLocal in Postgres per zone', async () => {
    const res = await get(ADMIN, NEW_YORK);

    expect((res.body as { todayLocal: string }).todayLocal).toBe('2026-03-09');
  });

  it('GET rejects an unknown query parameter, no token, and non-members', async () => {
    expectProblem(
      await auth(request(app.getHttpServer()).get(`${url()}?x=1`), VIEWER),
      400,
      'VALIDATION_FAILED',
    );
    expectProblem(await get(null), 401, 'UNAUTHENTICATED');
    expectProblem(await get(VIEWER, 'not-a-uuid'), 404, 'NOT_FOUND');
  });

  it('PATCH changes one threshold against the stored other, then the next read and tier filter use it', async () => {
    await db.query(
      `INSERT INTO vehicle (id, dealership_id, vin, make, model, model_year, mileage, status, stocked_on, updated_by)
       VALUES ('00000000-0000-4000-8000-000000000f01',$1,'B0000000000000001','BMW','X3',2022,1,'IN_STOCK','2026-01-30',$2)`,
      [LONDON, ADMIN],
    );
    const tier = () =>
      auth(
        request(app.getHttpServer()).get(
          `/api/v1/dealerships/${LONDON}/vehicles?tier=WATCH`,
        ),
        VIEWER,
      );
    expect(((await tier()).body as { items: unknown[] }).items).toHaveLength(0);

    const res = await patch({ watchDays: 30 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ watchDays: 30, agingDays: 90 });
    expect(((await tier()).body as { items: unknown[] }).items).toHaveLength(1);
    await db.query(
      `DELETE FROM vehicle WHERE id = '00000000-0000-4000-8000-000000000f01'`,
    );
  });

  it('PATCH accepts a pair valid only when merged, and agingDays alone', async () => {
    expect((await patch({ watchDays: 100, agingDays: 120 })).status).toBe(200);
    expect(await row()).toMatchObject({ watch_days: 100, aging_days: 120 });
    expect(
      ((await patch({ agingDays: 200 })).body as { agingDays: number })
        .agingDays,
    ).toBe(200);
  });

  it.each([
    [{ watchDays: 90 }],
    [{ watchDays: 0 }],
    [{ agingDays: 3651 }],
    [{ agingDays: 40000 }],
    [{ watchDays: 100 }],
  ])('PATCH %j is 422 THRESHOLDS_INVALID and writes nothing', async (body) => {
    const res = await patch(body);

    expectProblem(res, 422, 'THRESHOLDS_INVALID');
    expect(await row()).toMatchObject({ watch_days: 60, aging_days: 90 });
  });

  it('PATCH changes the time zone and returns the new local date', async () => {
    const res = await patch({ timezone: 'America/New_York' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      timezone: 'America/New_York',
      todayLocal: '2026-03-09',
    });
    expect((await patch({ timezone: 'Etc/UTC' })).status).toBe(200);
  });

  it.each(['america/new_york', 'Mars/Base', 'UTC+5', 'CET', 'EST', 'UTC'])(
    'PATCH timezone %s is 422 TIMEZONE_INVALID',
    async (timezone) => {
      expectProblem(await patch({ timezone }), 422, 'TIMEZONE_INVALID');
      expect((await row())?.timezone).toBe('Europe/London');
    },
  );

  it('reports THRESHOLDS_INVALID when both the pair and the zone are bad', async () => {
    expectProblem(
      await patch({ watchDays: 0, timezone: 'Mars/Base' }),
      422,
      'THRESHOLDS_INVALID',
    );
  });

  it.each([
    [{ name: 'X' }],
    [{ foo: 1 }],
    [{ watchDays: null }],
    [{ watchDays: '30' }],
    [{ watchDays: 30.5 }],
  ])('PATCH %j is 400 VALIDATION_FAILED', async (body) => {
    expectProblem(await patch(body), 400, 'VALIDATION_FAILED');
  });

  it('PATCH {} is a no-op returning the current settings', async () => {
    const res = await patch({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      timezone: 'Europe/London',
      watchDays: 60,
      agingDays: 90,
    });
  });

  it('PATCH is 403 for Manager and Viewer, 401 without a token, 404 for a non-member', async () => {
    expectProblem(await patch({}, MANAGER), 403, 'FORBIDDEN');
    expectProblem(await patch({}, VIEWER), 403, 'FORBIDDEN');
    expectProblem(await patch({}, null), 401, 'UNAUTHENTICATED');
    expectProblem(await patch({}, ADMIN, 'not-a-uuid'), 404, 'NOT_FOUND');
  });

  it('concurrent PATCHes never 500 and leave a valid pair', async () => {
    const results = await Promise.all([
      patch({ watchDays: 89 }),
      patch({ agingDays: 61 }),
    ]);

    expect(results.map((r) => r.status).sort()).not.toContain(500);
    expect(
      results.filter((r) => r.status === 200).length,
    ).toBeGreaterThanOrEqual(1);
    const r = await row();
    expect(r?.watch_days ?? 0).toBeGreaterThanOrEqual(1);
    expect(r?.watch_days ?? 0).toBeLessThan(r?.aging_days ?? 0);
  });

  it('a threshold check violated by a racing commit is 422 THRESHOLDS_INVALID, not 500', async () => {
    await db.query('BEGIN');
    await db.query('UPDATE dealership SET aging_days = 61 WHERE id = $1', [
      LONDON,
    ]);
    // The guard reads the committed 60/90, so 89 passes validateThresholds; the UPDATE then blocks on the row lock.
    const pending = patch({ watchDays: 89 }).then((r) => r);
    let blocked = false;
    for (let i = 0; i < 100; i++) {
      const { rowCount } = await db.query(
        `SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock'`,
      );
      if (rowCount) {
        blocked = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    await db.query('COMMIT');
    expect(blocked).toBe(true);

    const res = await pending;

    expectProblem(res, 422, 'THRESHOLDS_INVALID');
    expect(res.body).toMatchObject({
      detail:
        'watchDays must be at least 1, less than agingDays, and agingDays at most 3650.',
    });
    expect(await row()).toMatchObject({ watch_days: 60, aging_days: 61 });
  });
});
