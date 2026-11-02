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

const NOW = '2026-07-01T12:00:00.000Z';
const vid = (n: number, d = '0001') =>
  `00000000-0000-4000-8000-${d}${String(n).padStart(8, '0')}`;
const VIN = (n: number) => `A${String(n).padStart(16, '0')}`;

describe('vehicle status', { timeout: 30_000 }, () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication<App>;
  let db: pg.Client;
  let n = 0;
  const clock = new TestClock(new Date(NOW));
  const auth = (r: request.Test, user: string | null) =>
    user ? r.set('Authorization', `Bearer ${tokenFor(user, clock)}`) : r;
  const patch = (
    v: string,
    body: unknown,
    user: string | null = MANAGER,
    d = LONDON,
    q = '',
  ) =>
    auth(
      request(app.getHttpServer()).patch(
        `/api/v1/dealerships/${d}/vehicles/${v}/status${q}`,
      ),
      user,
    ).send(body as object);
  const move = (v: string, status: string) => patch(v, { status });
  const insert = async (status: string, d = LONDON, vin?: string) => {
    n++;
    const id = vid(n, d === LONDON ? '0001' : '0002');
    await db.query(
      `INSERT INTO vehicle (id, dealership_id, vin, make, model, model_year, mileage, status, stocked_on, sold_at, updated_by)
       VALUES ($1,$2,$3,'BMW','X3',2022,1000,$4,'2026-06-25',$5,$6)`,
      [id, d, vin ?? VIN(n), status, status === 'SOLD' ? NOW : null, ADMIN],
    );
    return id;
  };
  const row = async (id: string) =>
    (await db.query('SELECT * FROM vehicle WHERE id = $1', [id])).rows[0] as {
      status: string;
      sold_at: Date | null;
      updated_by: string;
      updated_at: Date;
    };

  beforeAll(async () => {
    container = await startMigratedPostgres();
    await seedDatabase(container.getConnectionUri());
    db = new pg.Client({ connectionString: container.getConnectionUri() });
    await db.connect();
    app = await buildApp(container.getConnectionUri(), clock);
  });

  afterAll(async () => {
    await app.close();
    await db.end();
    await container.stop();
  });

  it.each([
    ['IN_STOCK', 'RESERVED'],
    ['RESERVED', 'IN_STOCK'],
    ['IN_STOCK', 'SOLD'],
    ['RESERVED', 'SOLD'],
  ])('%s -> %s: 200 with the new status', async (from, to) => {
    const id = await insert(from);
    const res = await move(id, to);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, status: to });
    expect((await row(id)).status).toBe(to);
  });

  it.each([
    ['SOLD', 'IN_STOCK', 'A SOLD vehicle cannot move to IN_STOCK.'],
    ['SOLD', 'RESERVED', 'A SOLD vehicle cannot move to RESERVED.'],
    ['SOLD', 'SOLD', 'A SOLD vehicle cannot move to SOLD.'],
    ['IN_STOCK', 'IN_STOCK', 'An IN_STOCK vehicle cannot move to IN_STOCK.'],
    ['RESERVED', 'RESERVED', 'A RESERVED vehicle cannot move to RESERVED.'],
  ])(
    '%s -> %s: 409 INVALID_TRANSITION, row unchanged',
    async (from, to, detail) => {
      const id = await insert(from);
      const before = await row(id);
      const res = await move(id, to);
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        type: expect.stringContaining('invalid-transition') as string,
        detail,
      });
      expect(await row(id)).toEqual(before);
    },
  );

  it('records updated_by, updated_at and sold_at from the pinned clock', async () => {
    const at = new Date('2026-07-01T15:00:00.000Z');
    clock.current = at;
    const id = await insert('IN_STOCK');
    await move(id, 'RESERVED');
    let r = await row(id);
    expect(r.updated_by).toBe(MANAGER);
    expect(r.updated_at).toEqual(at);
    expect(r.sold_at).toBeNull();
    clock.current = new Date('2026-07-01T16:00:00.000Z');
    const res = await patch(id, { status: 'SOLD' }, ADMIN);
    r = await row(id);
    expect(r.updated_by).toBe(ADMIN);
    expect(r.sold_at).toEqual(clock.current);
    expect(res.body).toMatchObject({ daysInStock: 6 });
    clock.current = new Date(NOW);
  });

  it('400 on an unknown status, a missing status, an extra field or a query parameter', async () => {
    const id = await insert('IN_STOCK');
    for (const b of [{ status: 'GONE' }, {}, { status: 'SOLD', x: 1 }]) {
      const res = await patch(id, b);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        type: expect.stringContaining('validation-failed') as string,
      });
    }
    expect(
      (await patch(id, { status: 'SOLD' }, MANAGER, LONDON, '?x=1')).status,
    ).toBe(400);
    expect((await row(id)).status).toBe('IN_STOCK');
  });

  it('404 for a missing, malformed or other-dealership vehicle; 403 viewer; 401 no token', async () => {
    const id = await insert('IN_STOCK');
    const other = await insert('IN_STOCK', NEW_YORK);
    const bodies = [
      await move(vid(999), 'SOLD'),
      await move('not-a-uuid', 'SOLD'),
      await move(other, 'SOLD'),
    ];
    expect(bodies.map((r) => r.status)).toEqual([404, 404, 404]);
    expect((await move(id, 'SOLD')).status).toBe(200);
    expect((await patch(id, { status: 'SOLD' }, VIEWER)).status).toBe(403);
    expect((await patch(id, { status: 'SOLD' }, null)).status).toBe(401);
    expect((await row(other)).status).toBe('IN_STOCK');
  });

  it('a sell that commits first makes the blocked reserve a 409; final SOLD with sold_at', async () => {
    const id = await insert('IN_STOCK');
    const holder = new pg.Client({
      connectionString: container.getConnectionUri(),
    });
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(
        `UPDATE vehicle SET status = 'SOLD', sold_at = $2 WHERE id = $1`,
        [id, NOW],
      );
      const blocked = move(id, 'RESERVED').then((r) => r);
      await new Promise((r) => setTimeout(r, 300));
      await holder.query('COMMIT');
      const res = await blocked;
      expect(res.status).toBe(409);
      const r = await row(id);
      expect(r.status).toBe('SOLD');
      expect(r.sold_at).not.toBeNull();
    } finally {
      await holder.end();
    }
  });

  it('two parallel sells: one 200, one 409', async () => {
    const id = await insert('IN_STOCK');
    const res = await Promise.all([move(id, 'SOLD'), move(id, 'SOLD')]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('a sold VIN can be re-added', async () => {
    const id = await insert('IN_STOCK', LONDON, 'JH4KA8260MC000777');
    const vin = 'JH4KA8260MC000777';
    const add = () =>
      auth(
        request(app.getHttpServer()).post(
          `/api/v1/dealerships/${LONDON}/vehicles`,
        ),
        MANAGER,
      ).send({
        vin,
        make: 'Honda',
        model: 'Accord',
        modelYear: 2021,
        mileage: 1,
        stockedOn: '2026-06-26',
      });
    expect((await add()).status).toBe(409);
    await move(id, 'SOLD');
    expect((await add()).status).toBe(201);
  });

  it('actions: 409 on RESERVED, 201 once released', async () => {
    const id = await insert('IN_STOCK');
    const act = () =>
      auth(
        request(app.getHttpServer()).post(
          `/api/v1/dealerships/${LONDON}/vehicles/${id}/actions`,
        ),
        MANAGER,
      ).send({ actionType: 'OTHER' });
    await move(id, 'RESERVED');
    expect((await act()).status).toBe(409);
    await move(id, 'IN_STOCK');
    expect((await act()).status).toBe(201);
  });
});
