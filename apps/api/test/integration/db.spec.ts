import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { createDb, type Db } from '../../src/shared/db.js';
import { startMigratedPostgres, testConfig } from './support/postgres.js';

describe('database', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    pool = new Pool({ connectionString: container.getConnectionUri() });
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  describe('schema (migration 0000_init)', () => {
    it('creates the five tables', async () => {
      const { rows } = await pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' ORDER BY table_name`,
      );

      expect(rows.map((r) => r.table_name)).toEqual([
        'app_user',
        'dealership',
        'user_dealership',
        'vehicle',
        'vehicle_action',
      ]);
    });

    it('creates the §4.3 indexes', async () => {
      const { rows } = await pool.query<{
        indexname: string;
        indexdef: string;
      }>(
        `SELECT indexname, indexdef FROM pg_indexes
          WHERE schemaname = 'public' AND indexname NOT LIKE '%pkey'`,
      );
      const defs = Object.fromEntries(
        rows.map((r) => [r.indexname, r.indexdef]),
      );

      expect(Object.keys(defs).sort()).toEqual([
        'app_user_email_lower_uq',
        'vehicle_action_vehicle_id_idx',
        'vehicle_dealership_make_model_idx',
        'vehicle_dealership_status_stocked_idx',
        'vehicle_dealership_vin_open_uq',
      ]);
      expect(defs.app_user_email_lower_uq).toContain(
        'UNIQUE INDEX app_user_email_lower_uq ON public.app_user USING btree (lower(email))',
      );
      expect(defs.vehicle_dealership_vin_open_uq).toContain(
        "UNIQUE INDEX vehicle_dealership_vin_open_uq ON public.vehicle USING btree (dealership_id, vin) WHERE (status <> 'SOLD'::text)",
      );
      expect(defs.vehicle_dealership_status_stocked_idx).toContain(
        '(dealership_id, status, stocked_on)',
      );
      expect(defs.vehicle_dealership_make_model_idx).toContain(
        '(dealership_id, lower(make), lower(model))',
      );
      expect(defs.vehicle_action_vehicle_id_idx).toContain(
        '(vehicle_id, id DESC)',
      );
    });

    it('names every primary key <table>_pkey', async () => {
      const { rows } = await pool.query<{ conname: string; def: string }>(
        `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE contype = 'p' AND connamespace = 'public'::regnamespace
          ORDER BY conname`,
      );

      expect(rows).toEqual([
        { conname: 'app_user_pkey', def: 'PRIMARY KEY (id)' },
        { conname: 'dealership_pkey', def: 'PRIMARY KEY (id)' },
        {
          conname: 'user_dealership_pkey',
          def: 'PRIMARY KEY (user_id, dealership_id)',
        },
        { conname: 'vehicle_action_pkey', def: 'PRIMARY KEY (id)' },
        { conname: 'vehicle_pkey', def: 'PRIMARY KEY (id)' },
      ]);
    });

    it('creates the §4.3 CHECK constraints', async () => {
      const { rows } = await pool.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint
          WHERE contype = 'c' AND connamespace = 'public'::regnamespace
          ORDER BY conname`,
      );

      expect(rows.map((r) => r.conname)).toEqual([
        'app_user_status_chk',
        'dealership_thresholds_chk',
        'user_dealership_role_chk',
        'vehicle_action_note_chk',
        'vehicle_action_type_chk',
        'vehicle_mileage_chk',
        'vehicle_price_chk',
        'vehicle_sold_at_chk',
        'vehicle_status_chk',
        'vehicle_vin_chk',
      ]);
    });
  });

  describe('constraints', () => {
    const VIN = '1HGCM82633A004352';
    let dealershipId: string;
    let userId: string;

    async function idOf(text: string): Promise<string> {
      const { rows } = await pool.query<{ id: string }>(text);
      const id = rows[0]?.id;
      if (id === undefined) throw new Error('INSERT returned no row');
      return id;
    }

    beforeAll(async () => {
      dealershipId = await idOf(
        `INSERT INTO dealership (name, timezone) VALUES ('London', 'Europe/London') RETURNING id`,
      );
      userId = await idOf(
        `INSERT INTO app_user (email, display_name, password_hash)
         VALUES ('a@example.com', 'A', 'x') RETURNING id`,
      );
    });

    function insertVehicle(
      fields: {
        vin?: string;
        mileage?: number;
        status?: string;
        soldAt?: string | null;
      } = {},
    ) {
      const {
        vin = VIN,
        mileage = 0,
        status = 'IN_STOCK',
        soldAt = null,
      } = fields;
      return pool.query<{ id: string }>(
        `INSERT INTO vehicle (dealership_id, vin, make, model, model_year, mileage, status, sold_at, stocked_on, updated_by)
         VALUES ($1, $2, 'Honda', 'Accord', 2020, $3, $4, $5, '2026-01-01', $6) RETURNING id`,
        [dealershipId, vin, mileage, status, soldAt, userId],
      );
    }

    afterEach(async () => {
      await pool.query('DELETE FROM vehicle');
    });

    it.each([
      ['lowercase', '1hgcm82633a004352'],
      ['16 characters', '1HGCM82633A00435'],
      ['contains I', '1HGCM82633I004352'],
    ])('rejects a VIN that is %s', async (_case, vin) => {
      await expect(insertVehicle({ vin })).rejects.toMatchObject({
        constraint: 'vehicle_vin_chk',
      });
    });

    it('rejects negative mileage', async () => {
      await expect(insertVehicle({ mileage: -1 })).rejects.toMatchObject({
        constraint: 'vehicle_mileage_chk',
      });
    });

    it.each([
      ['SOLD without sold_at', 'SOLD', null],
      ['sold_at on an IN_STOCK vehicle', 'IN_STOCK', '2026-02-01T00:00:00Z'],
    ])('rejects %s', async (_case, status, soldAt) => {
      await expect(insertVehicle({ status, soldAt })).rejects.toMatchObject({
        constraint: 'vehicle_sold_at_chk',
      });
    });

    it.each([
      [90, 90],
      [91, 90],
      [0, 90],
      [60, 3651],
    ])('rejects thresholds watch=%i aging=%i', async (watch, aging) => {
      await expect(
        pool.query(
          `INSERT INTO dealership (name, timezone, watch_days, aging_days) VALUES ('X', 'UTC', $1, $2)`,
          [watch, aging],
        ),
      ).rejects.toMatchObject({ constraint: 'dealership_thresholds_chk' });
    });

    it('rejects a second non-sold vehicle with the same VIN in a dealership', async () => {
      await insertVehicle();

      await expect(insertVehicle({ status: 'RESERVED' })).rejects.toMatchObject(
        {
          constraint: 'vehicle_dealership_vin_open_uq',
        },
      );
    });

    it('lets a VIN be stocked again once the earlier vehicle is SOLD', async () => {
      await insertVehicle({ status: 'SOLD', soldAt: '2026-02-01T00:00:00Z' });

      await expect(insertVehicle()).resolves.toMatchObject({ rowCount: 1 });
    });
  });

  describe('statement timeout', () => {
    let db: Db;

    beforeAll(() => {
      db = createDb(
        testConfig(container.getConnectionUri(), {
          DB_STATEMENT_TIMEOUT_MS: '250',
        }),
      );
    });

    afterAll(async () => {
      await db.$client.end();
    });

    it('applies DB_STATEMENT_TIMEOUT_MS to the connection', async () => {
      const { rows } = await db.$client.query<{ statement_timeout: string }>(
        'SHOW statement_timeout',
      );

      expect(rows[0]?.statement_timeout).toBe('250ms');
    });

    it('cancels a query that runs longer', async () => {
      await expect(
        db.$client.query('SELECT pg_sleep(2)'),
      ).rejects.toMatchObject({
        code: '57014', // query_canceled
      });
    }, 5000);
  });
});
