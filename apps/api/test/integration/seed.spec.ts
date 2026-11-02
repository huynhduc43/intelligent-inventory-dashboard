import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { seed } from '../../db/seed.js';
import { startMigratedPostgres } from './support/postgres.js';

interface VehicleRow {
  name: string;
  status: string;
  vin: string;
  sold: boolean;
  age: number;
  watch_days: number;
  aging_days: number;
}

describe('seed', () => {
  let container: StartedPostgreSqlContainer;
  let client: pg.Client;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    client = new pg.Client({ connectionString: container.getConnectionUri() });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
    await container.stop();
  });

  const counts = async () => {
    const q = async (t: string) =>
      Number(
        (await client.query<{ n: string }>(`SELECT count(*) AS n FROM ${t}`))
          .rows[0]?.n,
      );
    return [
      await q('dealership'),
      await q('app_user'),
      await q('user_dealership'),
    ];
  };

  it('creates three dealerships, three users and six memberships, and a second run changes nothing', async () => {
    const first = await seed(client);
    const hashes = (
      await client.query('SELECT password_hash FROM app_user ORDER BY id')
    ).rows;
    const second = await seed(client, 'another-password-1234');

    expect(first.map((u) => u.email)).toEqual([
      'admin@example.dev',
      'manager@example.dev',
      'viewer@example.dev',
    ]);
    expect(first.every((u) => u.password.length >= 15)).toBe(true);
    expect(second).toEqual([]);
    expect(await counts()).toEqual([3, 3, 6]);
    expect(
      (await client.query('SELECT password_hash FROM app_user ORDER BY id'))
        .rows,
    ).toEqual(hashes);
    expect(
      (
        await client.query(
          'SELECT name, watch_days, aging_days FROM dealership ORDER BY name',
        )
      ).rows,
    ).toEqual([
      { name: 'London', watch_days: 60, aging_days: 90 },
      { name: 'New York', watch_days: 45, aging_days: 75 },
      { name: 'Sydney', watch_days: 60, aging_days: 90 },
    ]);
  });

  it('seeds vehicles with boundary ages, statuses and a re-acquired VIN, once', async () => {
    const vehicles = async () =>
      (
        await client.query<VehicleRow>(
          `SELECT d.name, v.status, v.vin, v.stocked_on::text AS stocked_on, v.sold_at IS NOT NULL AS sold,
                  (now() AT TIME ZONE d.timezone)::date - v.stocked_on AS age,
                  d.watch_days, d.aging_days, v.id
           FROM vehicle v JOIN dealership d ON d.id = v.dealership_id ORDER BY d.name, v.vin, v.status`,
        )
      ).rows;
    const before = await vehicles();
    await seed(client, 'another-password-1234');
    const rows = await vehicles();

    expect(rows).toEqual(before);
    for (const name of ['London', 'New York', 'Sydney']) {
      const mine = rows.filter((r) => r.name === name);
      expect(mine).toHaveLength(251); // 250 plus the re-acquired row
      const w = mine[0]?.watch_days ?? 0;
      const a = mine[0]?.aging_days ?? 0;
      const at = (n: number) =>
        mine.find(
          (r) =>
            r.vin.endsWith(String(n).padStart(12, '0')) &&
            r.status === 'IN_STOCK',
        )?.age;
      expect([1, 2, 3, 4].map(at)).toEqual([w - 1, w, a, a + 1]);
      expect(mine.some((r) => r.status === 'RESERVED')).toBe(true);
      expect(
        mine.filter((r) => r.status === 'SOLD' && r.sold),
      ).not.toHaveLength(0);
      const dup = mine.filter((r) => r.vin.endsWith('000000000020'));
      expect(dup.map((r) => r.status).sort()).toEqual(['IN_STOCK', 'SOLD']);
    }
  });

  it('adds no rows when re-run a day later', async () => {
    const all = async () =>
      (
        await client.query<{ t: string; n: string }>(
          `SELECT 'dealership' AS t, count(*) AS n FROM dealership
           UNION ALL SELECT 'app_user', count(*) FROM app_user
           UNION ALL SELECT 'user_dealership', count(*) FROM user_dealership
           UNION ALL SELECT 'vehicle', count(*) FROM vehicle
           UNION ALL SELECT 'vehicle_action', count(*) FROM vehicle_action
           ORDER BY t`,
        )
      ).rows;
    const before = await all();
    await client.query('UPDATE vehicle SET stocked_on = stocked_on - 1');
    await seed(client);

    expect(await all()).toEqual(before);
  });

  it('seeds the requested count and adds only the missing rows on a larger re-run', async () => {
    await client.query('DELETE FROM vehicle_action');
    await client.query('DELETE FROM vehicle');
    await seed(client, undefined, 2000);
    const n = async () =>
      Number(
        (await client.query<{ n: string }>('SELECT count(*) AS n FROM vehicle'))
          .rows[0]?.n,
      );

    expect(await n()).toBe(3 * 2001);
    await seed(client, undefined, 2000);
    expect(await n()).toBe(3 * 2001);
  });

  it('gives about 40% of in-stock Aging vehicles an action history, in order, once', async () => {
    await client.query('DELETE FROM vehicle_action');
    await client.query('DELETE FROM vehicle');
    await seed(client, undefined, 250);
    const stats = async () =>
      (
        await client.query<{
          name: string;
          aging: string;
          withHistory: string;
          multi: string;
          badAuthor: string;
          misordered: string;
          total: string;
        }>(
          `SELECT d.name,
             count(*) FILTER (WHERE v.status = 'IN_STOCK' AND (now() AT TIME ZONE d.timezone)::date - v.stocked_on > d.aging_days) AS aging,
             count(*) FILTER (WHERE v.status = 'IN_STOCK' AND (now() AT TIME ZONE d.timezone)::date - v.stocked_on > d.aging_days
                              AND EXISTS (SELECT 1 FROM vehicle_action a WHERE a.vehicle_id = v.id)) AS "withHistory",
             count(*) FILTER (WHERE (SELECT count(*) FROM vehicle_action a WHERE a.vehicle_id = v.id) > 1) AS multi,
             (SELECT count(*) FROM vehicle_action a JOIN user_dealership m ON m.dealership_id = a.dealership_id AND m.user_id = a.created_by
               WHERE a.dealership_id = d.id AND m.role = 'VIEWER') AS "badAuthor",
             (SELECT count(*) FROM vehicle_action a JOIN vehicle_action b ON b.vehicle_id = a.vehicle_id AND b.id > a.id AND b.created_at < a.created_at
               WHERE a.dealership_id = d.id) AS misordered,
             (SELECT count(*) FROM vehicle_action a WHERE a.dealership_id = d.id) AS total
           FROM dealership d JOIN vehicle v ON v.dealership_id = d.id GROUP BY d.id, d.name ORDER BY d.name`,
        )
      ).rows;
    const first = await stats();
    await seed(client, undefined, 250);

    expect(await stats()).toEqual(first);
    // A day passes: more vehicles cross aging_days, yet a re-run adds no action.
    const total = async () =>
      (
        await client.query<{ n: string }>(
          'SELECT count(*) AS n FROM vehicle_action',
        )
      ).rows[0]?.n;
    const before = await total();
    await client.query('UPDATE vehicle SET stocked_on = stocked_on - 1');
    await seed(client, undefined, 250);
    expect(await total()).toBe(before);
    expect(first).toHaveLength(3);
    for (const s of first) {
      const share = Number(s.withHistory) / Number(s.aging);
      expect(share).toBeGreaterThanOrEqual(0.35);
      expect(share).toBeLessThanOrEqual(0.45);
      expect(Number(s.multi)).toBeGreaterThan(0);
      expect(Number(s.badAuthor)).toBe(0);
      expect(Number(s.misordered)).toBe(0);
    }
    const authors = await client.query<{ name: string; email: string }>(
      `SELECT DISTINCT d.name, u.email FROM vehicle_action a JOIN dealership d ON d.id = a.dealership_id
       JOIN app_user u ON u.id = a.created_by ORDER BY d.name`,
    );
    expect(authors.rows).toEqual([
      { name: 'London', email: 'manager@example.dev' },
      { name: 'New York', email: 'manager@example.dev' },
      { name: 'Sydney', email: 'admin@example.dev' },
    ]);
  });

  it('rejects a short SEED_PASSWORD', async () => {
    await expect(seed(client, 'short')).rejects.toThrow(/15 characters/);
  });
});
