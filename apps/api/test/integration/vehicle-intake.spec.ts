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
const VIN = '1HGCM82633A004352';
const body = (o: Record<string, unknown> = {}) => ({
  vin: ` ${VIN.toLowerCase()} `,
  make: ' Honda ',
  model: 'Accord',
  modelYear: 2021,
  mileage: 18250,
  listPrice: '23995.5',
  stockedOn: '2026-06-26',
  ...o,
});

describe('vehicle intake', { timeout: 30_000 }, () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication<App>;
  let db: pg.Client;
  const clock = new TestClock(new Date(NOW));
  const path = (d = LONDON) => `/api/v1/dealerships/${d}/vehicles`;
  const post = (
    b: unknown,
    user: string | null = MANAGER,
    d = LONDON,
    q = '',
  ) => {
    const r = request(app.getHttpServer()).post(path(d) + q);
    return (
      user ? r.set('Authorization', `Bearer ${tokenFor(user, clock)}`) : r
    ).send(b as object);
  };
  const pointers = (res: request.Response) =>
    (res.body as { errors: { pointer: string }[] }).errors.map(
      (e) => e.pointer,
    );
  const rows = async (vin = VIN) =>
    (await db.query('SELECT * FROM vehicle WHERE vin = $1', [vin])).rows as {
      id: string;
      status: string;
      dealership_id: string;
      updated_by: string;
      created_at: Date;
      updated_at: Date;
    }[];

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

  it('creates a vehicle: 201, Location, normalised fields, equals GET of Location', async () => {
    clock.tickMs = 1;
    const res = await post(body());
    clock.tickMs = 0;

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String) as string,
      vin: VIN,
      make: 'Honda',
      model: 'Accord',
      modelYear: 2021,
      mileage: 18250,
      listPrice: '23995.50',
      status: 'IN_STOCK',
      stockedOn: '2026-06-26',
      daysInStock: 5,
      tier: 'FRESH',
      currentAction: null,
    });
    const id = (res.body as { id: string }).id;
    expect(res.headers.location).toBe(`${path()}/${id}`);
    const got = await request(app.getHttpServer())
      .get(`${path()}/${id}`)
      .set('Authorization', `Bearer ${tokenFor(VIEWER, clock)}`);
    expect(got.body).toEqual(res.body);
    const [row] = await rows();
    expect(row?.updated_by).toBe(MANAGER);
    expect(row?.created_at.toISOString()).toBe(row?.updated_at.toISOString());
  });

  it('409s on the same VIN while unsold, in any case or padding, and writes nothing', async () => {
    const res = await post(body({ vin: VIN }));

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'VIN_ALREADY_IN_STOCK' });
    expect(await rows()).toHaveLength(1);
  });

  it('409s on the same VIN while RESERVED', async () => {
    await db.query(
      `UPDATE vehicle SET status='RESERVED' WHERE vin=$1 AND dealership_id=$2`,
      [VIN, LONDON],
    );

    const res = await post(body({ vin: VIN }));
    await db.query(
      `UPDATE vehicle SET status='IN_STOCK' WHERE vin=$1 AND dealership_id=$2`,
      [VIN, LONDON],
    );

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'VIN_ALREADY_IN_STOCK' });
  });

  it('allows the same VIN in another dealership and, once SOLD, again in the same one', async () => {
    expect((await post(body(), ADMIN, NEW_YORK)).status).toBe(201);
    await db.query(
      `UPDATE vehicle SET status='SOLD', sold_at=$1 WHERE vin=$2 AND dealership_id=$3`,
      [NOW, VIN, LONDON],
    );

    const [sold] = (
      await db.query(
        'SELECT * FROM vehicle WHERE vin=$1 AND dealership_id=$2',
        [VIN, LONDON],
      )
    ).rows as { id: string }[];

    const res = await post(body());

    expect(res.status).toBe(201);
    expect((res.body as { id: string }).id).not.toBe(sold?.id);
    const after = await db.query('SELECT * FROM vehicle WHERE id=$1', [
      sold?.id,
    ]);
    expect(after.rows[0]).toMatchObject(sold as object);
    expect((await rows()).filter((r) => r.status === 'SOLD')).toHaveLength(1);
  });

  it('lets exactly one of concurrent same-VIN creates win', async () => {
    const vin = 'JH4KA8260MC000001';
    const all = await Promise.all(
      Array.from({ length: 5 }, () => post(body({ vin }))),
    );

    expect(all.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(await rows(vin)).toHaveLength(1);
  });

  it('accepts null / omitted listPrice and today as stockedOn', async () => {
    const a = await post(body({ vin: 'JH4KA8260MC000002', listPrice: null }));
    const rest: Record<string, unknown> = body({
      vin: 'JH4KA8260MC000003',
      stockedOn: '2026-07-01',
    });
    delete rest.listPrice;
    const b = await post(rest);

    expect(a.status).toBe(201);
    expect((a.body as { listPrice: null }).listPrice).toBeNull();
    expect(b.status).toBe(201);
    expect((b.body as { daysInStock: number }).daysInStock).toBe(0);
  });

  it.each([
    ['vin with O', { vin: '1HGCM82633A00435O' }, '/vin'],
    ['short vin', { vin: 'ABC' }, '/vin'],
    ['18-char vin', { vin: '1HGCM82633A0043522' }, '/vin'],
    ['vin with I', { vin: '1HGCM82633A00435I' }, '/vin'],
    ['vin with Q', { vin: '1HGCM82633A00435Q' }, '/vin'],
    ['negative price', { listPrice: '-1' }, '/listPrice'],
    ['11-digit price', { listPrice: '99999999999' }, '/listPrice'],
    ['empty make', { make: '  ' }, '/make'],
    ['NUL in model', { model: 'A\u0000B' }, '/model'],
    ['101-char make', { make: 'x'.repeat(101) }, '/make'],
    ['year 1899', { modelYear: 1899 }, '/modelYear'],
    ['fractional year', { modelYear: 2020.5 }, '/modelYear'],
    ['negative mileage', { mileage: -1 }, '/mileage'],
    ['mileage over int4', { mileage: 2147483648 }, '/mileage'],
    ['numeric price', { listPrice: 100 }, '/listPrice'],
    ['3-decimal price', { listPrice: '1.234' }, '/listPrice'],
    ['leading-zero price', { listPrice: '01' }, '/listPrice'],
    ['impossible date', { stockedOn: '2025-02-30' }, '/stockedOn'],
    ['pre-1900 date', { stockedOn: '1899-12-31' }, '/stockedOn'],
    ['future date', { stockedOn: '2026-07-02' }, '/stockedOn'],
    ['status key', { status: 'SOLD' }, '/status'],
    ['missing stockedOn', { stockedOn: undefined }, '/stockedOn'],
  ])('400s on %s', async (_n, o, pointer) => {
    const res = await post(body(o));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(pointers(res)).toContain(pointer);
  });

  it('400s on a query parameter, 401 / 403 / 404 on the guards', async () => {
    expect((await post(body(), MANAGER, LONDON, '?x=1')).status).toBe(400);
    expect((await post(body(), null)).status).toBe(401);
    expect((await post(body(), VIEWER)).status).toBe(403);
    expect((await post(body(), VIEWER, NEW_YORK)).status).toBe(404);
    expect((await post(body(), MANAGER, 'not-a-uuid')).status).toBe(404);
  });

  it('rejects a future date by the dealership-local today', async () => {
    // 12:00Z is 08:00 in New York: local today is 2026-07-01
    expect(
      (
        await post(
          body({ vin: 'JH4KA8260MC000004', stockedOn: '2026-07-02' }),
          ADMIN,
          NEW_YORK,
        )
      ).status,
    ).toBe(400);
  });
});
