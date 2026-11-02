import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { seed } from '../../db/seed.js';
import { startMigratedPostgres } from './support/postgres.js';

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

  it('rejects a short SEED_PASSWORD', async () => {
    await expect(seed(client, 'short')).rejects.toThrow(/15 characters/);
  });
});
