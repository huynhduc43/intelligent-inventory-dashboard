import type { INestApplication } from '@nestjs/common';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { tierOf } from '../../src/modules/inventory/domain/aging-policy.js';
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

interface Item {
  id: string;
  vin: string;
  status: string;
  stockedOn: string;
  daysInStock: number;
  tier: string;
  make: string;
  model: string;
  listPrice: string | null;
  currentAction: Record<string, unknown> | null;
}
interface Page {
  items: Item[];
  total: number;
}

// London, clock 2026-07-01 12:00Z => local today 2026-07-01 (BST). Thresholds 60/90.
const TODAY = '2026-07-01';
const ago = (n: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000)
    .toISOString()
    .slice(0, 10);
const vid = (n: number, d = 'd1') =>
  `00000000-0000-4000-8000-${d === 'd1' ? '0001' : '0002'}${String(n).padStart(8, '0')}`;
const vin = (n: number, p = 'A') => `${p}${String(n).padStart(16, '0')}`;

describe('vehicles list and detail', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication<App>;
  let db: pg.Client;
  const clock = new TestClock(new Date('2026-07-01T12:00:00Z'));
  const get = (path: string, user: string | null = VIEWER, c = clock) => {
    const r = request(app.getHttpServer()).get(path);
    return user ? r.set('Authorization', `Bearer ${tokenFor(user, c)}`) : r;
  };
  const list = (q = '', d = LONDON) =>
    get(
      `/api/v1/dealerships/${d}/vehicles${q}`,
      d === NEW_YORK ? MANAGER : VIEWER,
    );
  const page = async (q = '') => (await list(q)).body as Page;

  const insert = (
    n: number,
    age: number,
    o: {
      status?: string;
      make?: string;
      model?: string;
      soldAt?: string;
      dealership?: string;
      price?: string | null;
    } = {},
  ) =>
    db.query(
      `INSERT INTO vehicle (id, dealership_id, vin, make, model, model_year, mileage, list_price, status, stocked_on, sold_at, updated_by)
       VALUES ($1,$2,$3,$4,$5,2022,1000,$6,$7,$8::date,$9,$10)`,
      [
        vid(n, o.dealership === NEW_YORK ? 'd2' : 'd1'),
        o.dealership ?? LONDON,
        vin(n, o.dealership === NEW_YORK ? 'B' : 'A'),
        o.make ?? 'BMW',
        o.model ?? 'X3',
        o.price === undefined ? '23995.00' : o.price,
        o.status ?? 'IN_STOCK',
        ago(age),
        o.soldAt ?? null,
        ADMIN,
      ],
    );
  const action = (vehicle: string, type: string, note: string | null = null) =>
    db.query(
      `INSERT INTO vehicle_action (vehicle_id, dealership_id, action_type, note, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,'2026-06-30T14:05:00Z')`,
      [vehicle, LONDON, type, note, ADMIN],
    );

  beforeAll(async () => {
    container = await startMigratedPostgres();
    await seedDatabase(container.getConnectionUri());
    db = new pg.Client({ connectionString: container.getConnectionUri() });
    await db.connect();
    // ages: 1 -> 0, 2 -> 59, 3 -> 60, 4 -> 90, 5 -> 91, 6 -> 200 (all IN_STOCK, London)
    await insert(1, 0, { make: 'Toyota', model: 'Corolla', price: null });
    await insert(2, 59);
    await insert(3, 60);
    await insert(4, 90);
    await insert(5, 91);
    await insert(6, 200);
    await insert(7, 30, { status: 'RESERVED', make: 'Ford', model: 'Focus' });
    // sold 10 days ago London local; stocked 40 days ago => frozen 30 days
    await insert(8, 40, { status: 'SOLD', soldAt: '2026-06-21T12:00:00Z' });
    await insert(9, 5, { dealership: NEW_YORK });
    await action(vid(5), 'MONITOR', 'first');
    await action(vid(5), 'PRICE_REDUCTION_PLANNED', 'Drop 5%');
    app = await buildApp(container.getConnectionUri(), clock);
  });

  afterAll(async () => {
    await app.close();
    await db.end();
    await container.stop();
  });

  it('defaults to IN_STOCK, oldest first, limit 50, no-store', async () => {
    const res = await list();

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.body as Page;
    expect(body.items.map((i) => i.id)).toEqual(
      [6, 5, 4, 3, 2, 1].map((n) => vid(n)),
    );
    expect(body.total).toBe(6);
  });

  it('derives daysInStock and tier, and returns the documented fields', async () => {
    const { items } = await page();

    for (const i of items) {
      expect(i.tier).toBe(tierOf(i.daysInStock, { watch: 60, aging: 90 }));
    }
    expect(items.map((i) => [i.daysInStock, i.tier])).toEqual([
      [200, 'AGING'],
      [91, 'AGING'],
      [90, 'WATCH'],
      [60, 'WATCH'],
      [59, 'FRESH'],
      [0, 'FRESH'],
    ]);
    expect(items[0]).toEqual({
      id: vid(6),
      vin: vin(6),
      make: 'BMW',
      model: 'X3',
      modelYear: 2022,
      mileage: 1000,
      listPrice: '23995.00',
      status: 'IN_STOCK',
      stockedOn: ago(200),
      daysInStock: 200,
      tier: 'AGING',
      currentAction: null,
    });
    expect(items[5]?.listPrice).toBeNull();
  });

  it('returns the latest action by id as currentAction', async () => {
    const { items } = await page();

    expect(items.find((i) => i.id === vid(5))?.currentAction).toEqual({
      actionType: 'PRICE_REDUCTION_PLANNED',
      note: 'Drop 5%',
      createdBy: ADMIN,
      createdAt: '2026-06-30T14:05:00.000Z',
    });
  });

  it('filters by status, including several values', async () => {
    expect((await page('?status=RESERVED')).items.map((i) => i.id)).toEqual([
      vid(7),
    ]);
    const both = await page('?status=RESERVED,SOLD');
    expect(both.items.map((i) => i.status).sort()).toEqual([
      'RESERVED',
      'SOLD',
    ]);
    expect(both.total).toBe(2);
  });

  it('freezes a SOLD vehicle at the local date of sold_at', async () => {
    const { items } = await page('?status=SOLD');

    expect(items[0]).toMatchObject({ daysInStock: 30, tier: 'FRESH' });
  });

  it('matches make and model case-insensitively and exactly', async () => {
    expect((await page('?make=bmw')).total).toBe(5);
    expect((await page('?make=toyota&model=COROLLA')).items).toHaveLength(1);
    expect((await page('?make=bm')).items).toEqual([]);
  });

  it('filters by tier, with every row matching', async () => {
    for (const [tier, n] of [
      ['AGING', 2],
      ['WATCH', 2],
      ['FRESH', 2],
    ] as const) {
      const { items, total } = await page(`?tier=${tier}`);
      expect(total).toBe(n);
      expect(items.every((i) => i.tier === tier)).toBe(true);
    }
  });

  it('filters by age range', async () => {
    const { items } = await page('?minAgeDays=60&maxAgeDays=90');

    expect(items.map((i) => i.daysInStock)).toEqual([90, 60]);
    expect((await page('?minAgeDays=91')).total).toBe(2);
    expect((await page('?maxAgeDays=0')).total).toBe(1);
  });

  it('answers a contradictory tier and age pair with an empty page', async () => {
    expect(await page('?tier=FRESH&minAgeDays=100')).toEqual({
      items: [],
      total: 0,
    });
  });

  it('filters by hasAction', async () => {
    expect((await page('?hasAction=true')).items.map((i) => i.id)).toEqual([
      vid(5),
    ]);
    expect((await page('?hasAction=false')).total).toBe(5);
  });

  it('sorts newest first', async () => {
    expect(
      (await page('?sort=newest')).items.map((i) => i.daysInStock),
    ).toEqual([0, 59, 60, 90, 91, 200]);
  });

  it('pages with limit and offset and reports the total past the end', async () => {
    const first = await page('?limit=2&offset=0');
    expect(first.items.map((i) => i.id)).toEqual([vid(6), vid(5)]);
    expect(first.total).toBe(6);
    expect((await page('?limit=2&offset=4')).items).toHaveLength(2);
    expect(await page('?offset=100')).toEqual({ items: [], total: 6 });
  });

  it('never returns another dealership', async () => {
    const ny = (await list('', NEW_YORK)).body as Page;
    expect(ny.items.map((i) => i.id)).toEqual([vid(9, 'd2')]);
    const london = await page('?status=IN_STOCK,RESERVED,SOLD');
    expect(london.items.map((i) => i.id)).not.toContain(vid(9, 'd2'));
  });

  it.each([
    ['limit=101'],
    ['limit=0'],
    ['limit='],
    ['limit=1e2'],
    ['offset=-1'],
    ['offset='],
    ['minAgeDays=abc'],
    ['hasAction=yes'],
    ['tier=OLD'],
    ['status=GONE'],
    ['status='],
    ['status=IN_STOCK&status=SOLD'],
    ['make='],
    ['sort=sideways'],
    ['minAgeDays=10&maxAgeDays=5'],
    ['status=SOLD&tier=AGING'],
    ['status=IN_STOCK,SOLD&minAgeDays=1'],
    ['foo=1'],
  ])('rejects ?%s with 400 VALIDATION_FAILED', async (q) => {
    const res = await list(`?${q}`);

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/problem\+json/);
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ pointer: expect.stringMatching(/^\/\w/) as string }],
    });
  });

  it('points a cross-field error at the offending filter', async () => {
    const res = await list('?status=SOLD&tier=AGING&maxAgeDays=3');

    expect(
      (res.body as { errors: { pointer: string }[] }).errors.map(
        (e) => e.pointer,
      ),
    ).toEqual(['/tier', '/maxAgeDays']);
  });

  describe('day counting in the dealership time zone (P1)', () => {
    // The app and the token minting share `clock`, so the tests move it instead of passing another one.
    afterEach(() => {
      clock.current = new Date('2026-07-01T12:00:00Z');
    });
    const at = (iso: string) => {
      clock.current = new Date(iso);
    };
    const days = async (d: string, id: string) =>
      (
        (await get(`/api/v1/dealerships/${d}/vehicles/${id}`, MANAGER))
          .body as Item
      ).daysInStock;

    it('differs by one between 23:30 and 00:30 New York time', async () => {
      // vehicle 9 is stocked 5 days before 2026-07-01
      at('2026-07-02T03:30:00Z'); // 23:30 on 1 July in New York
      expect(await days(NEW_YORK, vid(9, 'd2'))).toBe(5);
      at('2026-07-02T04:30:00Z'); // 00:30 on 2 July
      expect(await days(NEW_YORK, vid(9, 'd2'))).toBe(6);
    });

    it('advances exactly one per calendar day across the London DST change', async () => {
      await db.query(
        `UPDATE vehicle SET stocked_on = '2026-03-25' WHERE id = $1`,
        [vid(1)],
      );
      const seen: number[] = [];
      // UK clocks went forward on 2026-03-29 (a 23-hour day). Noon UTC each day.
      for (const day of ['26', '27', '28', '29', '30', '31']) {
        at(`2026-03-${day}T12:00:00Z`);
        seen.push(await days(LONDON, vid(1)));
      }

      expect(seen).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  describe('detail', () => {
    const one = (id: string, d = LONDON, q = '') =>
      get(`/api/v1/dealerships/${d}/vehicles/${id}${q}`);

    it('returns the vehicle with derived fields and no-store', async () => {
      const res = await one(vid(5));

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toMatchObject({
        id: vid(5),
        daysInStock: 91,
        tier: 'AGING',
        currentAction: { actionType: 'PRICE_REDUCTION_PLANNED' },
      });
      expect((await one(vid(4))).body).toMatchObject({ currentAction: null });
    });

    it('gives unknown, malformed and other-dealership ids the same 404', async () => {
      const bodies = await Promise.all([
        one('00000000-0000-4000-8000-00000000ffff'),
        one('not-a-uuid'),
        one(vid(9, 'd2')),
      ]);

      for (const r of bodies) {
        expect(r.status).toBe(404);
        expect(r.body).toMatchObject({
          code: 'NOT_FOUND',
          detail: 'Resource not found.',
        });
      }
      const strip = (r: request.Response) =>
        JSON.stringify({ ...(r.body as object), instance: '' });
      expect(new Set(bodies.map(strip)).size).toBe(1);
    });

    it('rejects any query parameter with 400', async () => {
      const res = await one(vid(5), LONDON, '?status=SOLD');

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });
});
