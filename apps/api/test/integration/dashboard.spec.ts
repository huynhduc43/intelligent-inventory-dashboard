import type { INestApplication } from '@nestjs/common';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { Dashboard } from '../../src/modules/dashboard/dashboard.service.js';
import {
  bucketOf,
  tierOf,
} from '../../src/modules/inventory/domain/aging-policy.js';
import { startMigratedPostgres } from './support/postgres.js';
import {
  ADMIN,
  buildApp,
  LONDON,
  NEW_YORK,
  SYDNEY,
  seedDatabase,
  TestClock,
  tokenFor,
  VIEWER,
} from './support/auth.js';

// London, clock 2026-07-01 12:00Z => local today 2026-07-01. Thresholds 60/90.
const TODAY = '2026-07-01';
const ago = (n: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000)
    .toISOString()
    .slice(0, 10);
const vid = (n: number) =>
  `00000000-0000-4000-8000-0001${String(n).padStart(8, '0')}`;

describe('dashboard', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication<App>;
  let db: pg.Client;
  const clock = new TestClock(new Date('2026-07-01T12:00:00Z'));
  const get = (path: string, user: string | null = VIEWER) => {
    const r = request(app.getHttpServer()).get(path);
    return user ? r.set('Authorization', `Bearer ${tokenFor(user, clock)}`) : r;
  };
  const raw = (d = LONDON, user: string | null = VIEWER) =>
    get(`/api/v1/dealerships/${d}/dashboard`, user);
  const dash = async (d = LONDON) => {
    const r = await raw(d);
    return { status: r.status, headers: r.headers, body: r.body as Dashboard };
  };

  const insert = (
    n: number,
    age: number,
    o: { status?: string; make?: string; model?: string; d?: string } = {},
  ) =>
    db.query(
      `INSERT INTO vehicle (id, dealership_id, vin, make, model, model_year, mileage, list_price, status, stocked_on, sold_at, updated_by)
       VALUES ($1,$2,$3,$4,$5,2022,1000,null,$6,$7::date,$8,$9)`,
      [
        vid(n),
        o.d ?? LONDON,
        `V${String(n).padStart(16, '0')}`,
        o.make ?? 'BMW',
        o.model ?? 'X3',
        o.status ?? 'IN_STOCK',
        ago(age),
        o.status === 'SOLD' ? '2026-06-21T12:00:00Z' : null,
        ADMIN,
      ],
    );
  const action = (vehicle: string, type: string) =>
    db.query(
      `INSERT INTO vehicle_action (vehicle_id, dealership_id, action_type, created_by)
       VALUES ($1,$2,$3,$4)`,
      [vehicle, LONDON, type, ADMIN],
    );

  // ages: 0, 30, 31, 59, 60, 90, 91, 91, 200 => tiers F4 W2 A3 ... see assertions
  const AGES = [0, 30, 31, 59, 60, 90, 91, 91, 200];

  beforeAll(async () => {
    container = await startMigratedPostgres();
    await seedDatabase(container.getConnectionUri());
    db = new pg.Client({ connectionString: container.getConnectionUri() });
    await db.connect();
    for (const [i, age] of AGES.entries()) {
      await insert(i + 1, age, {
        make: age > 90 ? 'Toyota' : 'BMW',
        model: age > 90 ? 'Corolla' : 'X3',
      });
    }
    await insert(20, 100, { status: 'RESERVED' });
    await insert(21, 100, { status: 'SOLD' });
    await insert(22, 100, { d: NEW_YORK });
    // v7 (91): MONITOR only; v8 (91): none; v9 (200): two actions, newest is TRANSFER; v1 (0): AUCTION
    await action(vid(7), 'MONITOR');
    await action(vid(9), 'AUCTION');
    await action(vid(9), 'TRANSFER');
    await action(vid(1), 'AUCTION');
    // actions on excluded vehicles count nowhere
    await action(vid(20), 'OTHER');
    app = await buildApp(container.getConnectionUri(), clock);
  });

  afterAll(async () => {
    await app.close();
    await db.end();
    await container.stop();
  });

  it('returns the documented shape with no-store and a request id', async () => {
    const r = await raw();
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-request-id']).toBeTruthy();
    expect(Object.keys(r.body as object).sort()).toEqual(
      [
        'actionStats',
        'ageBuckets',
        'asOf',
        'byMakeModel',
        'summary',
        'thresholds',
        'timezone',
      ].sort(),
    );
    expect((r.body as Dashboard).asOf).toBe('2026-07-01T12:00:00.000Z');
    expect((r.body as Dashboard).timezone).toBe('Europe/London');
    expect((r.body as Dashboard).thresholds).toEqual({
      watchDays: 60,
      agingDays: 90,
    });
  });

  it('matches tierOf and bucketOf over the vehicle list, and counts IN_STOCK only', async () => {
    const list = await get(`/api/v1/dealerships/${LONDON}/vehicles?limit=100`);
    const items = (list.body as { items: { daysInStock: number }[] }).items as {
      daysInStock: number;
    }[];
    const t = { watch: 60, aging: 90 };
    const byTier = { FRESH: 0, WATCH: 0, AGING: 0 };
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    for (const v of items) {
      byTier[tierOf(v.daysInStock, t)]++;
      buckets[bucketOf(v.daysInStock)]++;
    }
    const { body } = await dash();
    expect(body.summary.totalInStock).toBe(
      (list.body as { total: number }).total,
    );
    expect(body.summary.totalInStock).toBe(AGES.length);
    expect(body.summary.byTier).toEqual(byTier);
    expect(body.ageBuckets).toEqual(
      Object.entries(buckets).map(([bucket, count]) => ({ bucket, count })),
    );
    expect(body.summary.avgDaysInStock).toBe(
      Math.round((AGES.reduce((a, b) => a + b) / AGES.length) * 10) / 10,
    );
  });

  it('counts aging vehicles without any action (MONITOR is an action)', async () => {
    const { body } = await dash();
    // aging: 91 (MONITOR), 91 (none), 200 (actions) => 1
    expect(body.summary.byTier.AGING).toBe(3);
    expect(body.summary.agingWithoutAction).toBe(1);
  });

  it('groups by make and model, ordered by count then name', async () => {
    const { body } = await dash();
    expect(body.byMakeModel).toEqual([
      { make: 'BMW', model: 'X3', count: 6, aging: 0 },
      { make: 'Toyota', model: 'Corolla', count: 3, aging: 3 },
    ]);
  });

  it('counts each vehicle by its latest action, NONE first, seven entries', async () => {
    const { body } = await dash();
    expect(body.actionStats).toEqual([
      { actionType: 'NONE', count: 6 },
      { actionType: 'PRICE_REDUCTION_PLANNED', count: 0 },
      { actionType: 'TRANSFER', count: 1 },
      { actionType: 'AUCTION', count: 1 },
      { actionType: 'PROMOTION', count: 0 },
      { actionType: 'MONITOR', count: 1 },
      { actionType: 'OTHER', count: 0 },
    ]);
  });

  it('returns zeros and a null average for a dealership with no stock', async () => {
    const r = await raw(SYDNEY, ADMIN);
    const b = r.body as Dashboard;
    expect(r.status).toBe(200);
    expect(b.summary).toEqual({
      totalInStock: 0,
      byTier: { FRESH: 0, WATCH: 0, AGING: 0 },
      agingWithoutAction: 0,
      avgDaysInStock: null,
    });
    expect(b.byMakeModel).toEqual([]);
    expect(b.ageBuckets.map((x) => x.count)).toEqual([0, 0, 0, 0]);
    expect(b.actionStats).toHaveLength(7);
  });

  it('rejects missing token (401), non-member and unknown dealership (404), and any query (400)', async () => {
    expect(
      (await get(`/api/v1/dealerships/${LONDON}/dashboard`, null)).status,
    ).toBe(401);
    const other = await raw(NEW_YORK);
    const unknown = await raw('00000000-0000-4000-8000-00000000ffff');
    expect(other.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect({ ...(other.body as object), instance: '' }).toEqual({
      ...(unknown.body as object),
      instance: '',
    });
    const q = await get(`/api/v1/dealerships/${LONDON}/dashboard?x=1`);
    expect(q.status).toBe(400);
    expect((q.body as { code: string }).code).toBe('VALIDATION_FAILED');
  });
});
