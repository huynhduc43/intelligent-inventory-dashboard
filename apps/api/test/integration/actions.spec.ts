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

const NOW = '2026-07-01T12:00:00.000Z';
const vid = (n: number, d = '0001') =>
  `00000000-0000-4000-8000-${d}${String(n).padStart(8, '0')}`;
const FRESH = vid(1);
const RESERVED = vid(2);
const SOLD = vid(3);
const OTHER = vid(4, '0002');

describe('vehicle actions', { timeout: 30_000 }, () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication<App>;
  let db: pg.Client;
  const clock = new TestClock(new Date(NOW));
  const path = (v: string, d = LONDON) =>
    `/api/v1/dealerships/${d}/vehicles/${v}/actions`;
  const auth = (r: request.Test, user: string | null) =>
    user ? r.set('Authorization', `Bearer ${tokenFor(user, clock)}`) : r;
  const post = (v: string, body: unknown, user: string | null = MANAGER) =>
    auth(request(app.getHttpServer()).post(path(v)), user).send(body as object);
  const get = (v: string, user: string | null = VIEWER, d = LONDON) =>
    auth(request(app.getHttpServer()).get(path(v, d)), user);
  const count = async (v: string) =>
    Number(
      (
        await db.query<{ n: string }>(
          'SELECT count(*) AS n FROM vehicle_action WHERE vehicle_id = $1',
          [v],
        )
      ).rows[0]?.n,
    );
  const insert = (id: string, d: string, n: number, status: string) =>
    db.query(
      `INSERT INTO vehicle (id, dealership_id, vin, make, model, model_year, mileage, status, stocked_on, sold_at, updated_by)
       VALUES ($1,$2,$3,'BMW','X3',2022,1000,$4,'2026-06-25',$5,$6)`,
      [
        id,
        d,
        `A${String(n).padStart(16, '0')}`,
        status,
        status === 'SOLD' ? NOW : null,
        ADMIN,
      ],
    );

  beforeAll(async () => {
    container = await startMigratedPostgres();
    await seedDatabase(container.getConnectionUri());
    db = new pg.Client({ connectionString: container.getConnectionUri() });
    await db.connect();
    await insert(FRESH, LONDON, 1, 'IN_STOCK');
    await insert(RESERVED, LONDON, 2, 'RESERVED');
    await insert(SOLD, LONDON, 3, 'SOLD');
    await insert(OTHER, NEW_YORK, 4, 'IN_STOCK');
    app = await buildApp(container.getConnectionUri(), clock);
  });

  afterAll(async () => {
    await app.close();
    await db.end();
    await container.stop();
  });

  it('logs an action on a FRESH in-stock vehicle: 201, Location, caller and pinned clock', async () => {
    const res = await post(FRESH, {
      actionType: 'PRICE_REDUCTION_PLANNED',
      note: '  Cut £500 ',
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number) as number,
      actionType: 'PRICE_REDUCTION_PLANNED',
      note: 'Cut £500',
      createdBy: MANAGER,
      createdAt: NOW,
    });
    expect(res.headers.location).toBe(
      `${path(FRESH)}/${String((res.body as { id: number }).id)}`,
    );
    const row = await db.query<{ created_by: string; created_at: Date }>(
      'SELECT created_by, created_at FROM vehicle_action WHERE id = $1',
      [(res.body as { id: number }).id],
    );
    expect(row.rows[0]?.created_by).toBe(MANAGER);
    expect(row.rows[0]?.created_at.toISOString()).toBe(NOW);
  });

  it.each([
    ['RESERVED', RESERVED],
    ['SOLD', SOLD],
  ])('409s on a %s vehicle and writes nothing', async (status, v) => {
    const res = await post(v, { actionType: 'MONITOR' });

    expectProblem(res, 409, 'VEHICLE_NOT_IN_STOCK');
    expect(res.body).toMatchObject({
      detail: `Vehicle is ${status}; an action can only be logged on an IN_STOCK vehicle.`,
    });
    expect(await count(v)).toBe(0);
  });

  it('404s on unknown, non-UUID and other-dealership vehicles', async () => {
    for (const v of [vid(99), 'not-a-uuid', OTHER]) {
      const res = await post(v, { actionType: 'MONITOR' });
      expectProblem(res, 404, 'NOT_FOUND');
      expectProblem(await get(v), 404, 'NOT_FOUND');
    }
    expect(await count(OTHER)).toBe(0);
  });

  it('validates the body and the query', async () => {
    const bad: unknown[] = [
      { actionType: 'MONITOR', colour: 'red' },
      { actionType: 'monitor' },
      {},
      { actionType: 'MONITOR', note: 5 },
      { actionType: 'MONITOR', note: 'x'.repeat(1001) },
      { actionType: 'MONITOR', note: 'a\u0000b' },
    ];
    for (const body of bad) {
      const res = await post(FRESH, body);
      expectProblem(res, 400, 'VALIDATION_FAILED');
      expect((res.body as { errors: unknown[] }).errors.length).toBeGreaterThan(
        0,
      );
    }
    const unknown = await post(FRESH, { actionType: 'MONITOR', colour: 'x' });
    expect(
      (unknown.body as { errors: { pointer: string }[] }).errors[0]?.pointer,
    ).toBe('/colour');
    const query = await auth(
      request(app.getHttpServer()).post(`${path(FRESH)}?note=x`),
      MANAGER,
    ).send({ actionType: 'MONITOR' });
    expectProblem(query, 400, 'VALIDATION_FAILED');
    expectProblem(
      await get(FRESH, VIEWER).query({ a: 1 }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('accepts a 1000-character note and stores a blank or null note as null', async () => {
    expect(
      (await post(FRESH, { actionType: 'OTHER', note: 'x'.repeat(1000) }))
        .status,
    ).toBe(201);
    for (const note of ['   ', null, undefined]) {
      const res = await post(FRESH, { actionType: 'OTHER', note });
      expect(res.status).toBe(201);
      expect((res.body as { note: unknown }).note).toBeNull();
    }
  });

  it('lists the history newest first and makes the newest the current action', async () => {
    const v = vid(10);
    await insert(v, LONDON, 10, 'IN_STOCK');
    const empty = await get(v);
    expect(empty.body).toEqual({ items: [] });
    expect(empty.headers['cache-control']).toBe('no-store');

    const a = (await post(v, { actionType: 'MONITOR' })).body as { id: number };
    const b = (await post(v, { actionType: 'AUCTION', note: 'go' })).body as {
      id: number;
    };

    const { items } = (await get(v)).body as { items: { id: number }[] };
    expect(items.map((i) => i.id)).toEqual([b.id, a.id]);
    const detail = await auth(
      request(app.getHttpServer()).get(
        `/api/v1/dealerships/${LONDON}/vehicles/${v}`,
      ),
      VIEWER,
    );
    expect(detail.body).toMatchObject({
      currentAction: { actionType: 'AUCTION', note: 'go' },
    });
  });

  it('keeps both of two concurrent posts and treats the higher id as current', async () => {
    const v = vid(11);
    await insert(v, LONDON, 11, 'IN_STOCK');
    const [x, y] = await Promise.all([
      post(v, { actionType: 'TRANSFER' }),
      post(v, { actionType: 'PROMOTION' }, ADMIN),
    ]);

    expect([x.status, y.status]).toEqual([201, 201]);
    const { items } = (await get(v)).body as {
      items: { id: number; actionType: string }[];
    };
    expect(items).toHaveLength(2);
    const top = items[0];
    const list = await auth(
      request(app.getHttpServer()).get(
        `/api/v1/dealerships/${LONDON}/vehicles?status=IN_STOCK&limit=100`,
      ),
      VIEWER,
    );
    const current = (
      list.body as {
        items: { id: string; currentAction: { actionType: string } }[];
      }
    ).items.find((i) => i.id === v);
    expect(current?.currentAction.actionType).toBe(top?.actionType);
    const detail = await auth(
      request(app.getHttpServer()).get(
        `/api/v1/dealerships/${LONDON}/vehicles/${v}`,
      ),
      VIEWER,
    );
    expect(
      (detail.body as { currentAction: { actionType: string } }).currentAction
        .actionType,
    ).toBe(top?.actionType);
    expect(top?.id).toBe(Math.max(...items.map((i) => i.id)));
  });

  it('still returns the history of a sold vehicle', async () => {
    const v = vid(12);
    await insert(v, LONDON, 12, 'IN_STOCK');
    await post(v, { actionType: 'MONITOR' });
    await db.query(
      "UPDATE vehicle SET status = 'SOLD', sold_at = $2 WHERE id = $1",
      [v, NOW],
    );

    const res = await get(v);
    expect((res.body as { items: unknown[] }).items).toHaveLength(1);
  });

  it('has no PATCH or DELETE on the path', async () => {
    for (const m of ['patch', 'delete'] as const) {
      const res = await auth(
        request(app.getHttpServer())[m](path(FRESH)),
        MANAGER,
      );
      expectProblem(res, 404, 'NOT_FOUND');
    }
  });

  it('applies roles and tenancy to both routes', async () => {
    for (const u of [ADMIN, MANAGER, VIEWER]) {
      expect((await get(FRESH, u)).status).toBe(200);
    }
    expect((await post(FRESH, { actionType: 'OTHER' }, ADMIN)).status).toBe(
      201,
    );
    expect((await post(FRESH, { actionType: 'OTHER' }, VIEWER)).status).toBe(
      403,
    );
    expectProblem(
      await post(FRESH, { actionType: 'OTHER' }, null),
      401,
      'UNAUTHENTICATED',
    );
    expectProblem(await get(FRESH, null), 401, 'UNAUTHENTICATED');
    const missing = await get(FRESH, VIEWER, vid(0, '0009'));
    const nonMember = await get(FRESH, VIEWER, NEW_YORK);
    const strip = (r: request.Response) => ({
      ...(r.body as object),
      instance: '',
    });
    expectProblem(nonMember, 404, 'NOT_FOUND');
    expect(strip(nonMember)).toEqual(strip(missing));
    expect((await post(FRESH, { actionType: 'OTHER' }, VIEWER)).status).toBe(
      403,
    );
    const postNonMember = await auth(
      request(app.getHttpServer()).post(path(OTHER, NEW_YORK)),
      VIEWER,
    ).send({ actionType: 'OTHER' });
    expectProblem(postNonMember, 404, 'NOT_FOUND');
    const postMissing = await auth(
      request(app.getHttpServer()).post(path(OTHER, vid(0, '0009'))),
      VIEWER,
    ).send({ actionType: 'OTHER' });
    expect(strip(postNonMember)).toEqual(strip(postMissing));
  });
});
