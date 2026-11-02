import { Writable } from 'node:stream';
import { Controller, Get, type INestApplication, Req } from '@nestjs/common';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { RequirePermission } from '../../src/modules/auth/decorators.js';
import { PERMISSIONS } from '../../src/modules/auth/domain/permissions.js';
import type { AuthedRequest } from '../../src/modules/auth/request-context.js';
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

// Test-only probe: one route per permission. Later issues add their real routes as rows of the table below.
@Controller('api/v1/dealerships/:dealershipId/probe')
class ProbeController {
  @Get('vehicle-read')
  @RequirePermission('vehicle:read')
  a(@Req() r: AuthedRequest) {
    return r.dealership;
  }
  @Get('dashboard-read')
  @RequirePermission('dashboard:read')
  b(@Req() r: AuthedRequest) {
    return r.dealership;
  }
  @Get('vehicle-action-read')
  @RequirePermission('vehicle_action:read')
  c(@Req() r: AuthedRequest) {
    return r.dealership;
  }
  @Get('settings-read')
  @RequirePermission('settings:read')
  d(@Req() r: AuthedRequest) {
    return r.dealership;
  }
  @Get('vehicle-create')
  @RequirePermission('vehicle:create')
  e(@Req() r: AuthedRequest) {
    return r.dealership;
  }
  @Get('vehicle-change-status')
  @RequirePermission('vehicle:change_status')
  f(@Req() r: AuthedRequest) {
    return r.dealership;
  }
  @Get('vehicle-action-create')
  @RequirePermission('vehicle_action:create')
  g(@Req() r: AuthedRequest) {
    return r.dealership;
  }
  @Get('settings-update')
  @RequirePermission('settings:update')
  h(@Req() r: AuthedRequest) {
    return r.dealership;
  }
}

const PATH: Record<(typeof PERMISSIONS)[number], string> = {
  'vehicle:read': 'vehicle-read',
  'dashboard:read': 'dashboard-read',
  'vehicle_action:read': 'vehicle-action-read',
  'settings:read': 'settings-read',
  'vehicle:create': 'vehicle-create',
  'vehicle:change_status': 'vehicle-change-status',
  'vehicle_action:create': 'vehicle-action-create',
  'settings:update': 'settings-update',
};

// The §4.6 table, independent of the code under test. Order follows PERMISSIONS; columns Admin, Manager, Viewer.
const MATRIX: [(typeof PERMISSIONS)[number], boolean, boolean, boolean][] = [
  ['vehicle:read', true, true, true],
  ['dashboard:read', true, true, true],
  ['vehicle_action:read', true, true, true],
  ['settings:read', true, true, true],
  ['vehicle:create', true, true, false],
  ['vehicle:change_status', true, true, false],
  ['vehicle_action:create', true, true, false],
  ['settings:update', true, false, false],
];

describe('D15/D16 route x role', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication<App>;
  const clock = new TestClock(new Date('2026-07-01T23:30:00Z'));
  const url = (permission: string, dealership = LONDON) =>
    `/api/v1/dealerships/${dealership}/probe/${PATH[permission as keyof typeof PATH]}`;
  const get = (path: string, user?: string) => {
    const r = request(app.getHttpServer()).get(path);
    return user ? r.set('Authorization', `Bearer ${tokenFor(user, clock)}`) : r;
  };
  const sql = async (text: string, params: unknown[] = []) => {
    const client = new pg.Client({
      connectionString: container.getConnectionUri(),
    });
    await client.connect();
    await client.query(text, params);
    await client.end();
  };

  beforeAll(async () => {
    container = await startMigratedPostgres();
    await seedDatabase(container.getConnectionUri(), 1);
    app = await buildApp(container.getConnectionUri(), clock, [
      ProbeController,
    ]);
  });

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('covers every permission', () => {
    expect(MATRIX.map((r) => r[0])).toEqual([...PERMISSIONS]);
  });

  it.each(MATRIX)(
    '%s: admin %s, manager %s, viewer %s; non-member 404',
    async (p, admin, manager, viewer) => {
      const status = (allowed: boolean) => (allowed ? 200 : 403);

      expect((await get(url(p), ADMIN)).status).toBe(status(admin));
      expect((await get(url(p), MANAGER)).status).toBe(status(manager));
      expect((await get(url(p), VIEWER)).status).toBe(status(viewer));
      expect((await get(url(p, NEW_YORK), VIEWER)).status).toBe(404);
    },
  );

  describe('vehicle routes', () => {
    const vehicleId = `0000000${LONDON.slice(-1)}-0000-4000-8000-000000000001`;
    const suffix = [
      'vehicles',
      `vehicles/${vehicleId}`,
      'dashboard',
      `vehicles/${vehicleId}/actions`,
    ];
    const route = (d: string, i: number) =>
      `/api/v1/dealerships/${d}/${suffix[i] ?? ''}`;

    it.each([0, 1, 2, 3])(
      'route %i: every role 200, non-member 404, no token 401',
      async (i) => {
        for (const u of [ADMIN, MANAGER, VIEWER]) {
          expect((await get(route(LONDON, i), u)).status).toBe(200);
        }
        expect((await get(route(NEW_YORK, i), VIEWER)).status).toBe(404);
        expect((await get(route(LONDON, i))).status).toBe(401);
      },
    );

    it.each([0, 1, 2, 3])(
      'route %i: non-member 404 body equals the missing-dealership body',
      async (i) => {
        const bodies = await Promise.all(
          [NEW_YORK, '00000000-0000-4000-8000-0000000000ee', 'not-a-uuid'].map(
            (d) => get(route(d, i), VIEWER),
          ),
        );
        const strip = (r: request.Response) =>
          JSON.stringify({ ...(r.body as object), instance: '' });

        expect(bodies.map((r) => r.status)).toEqual([404, 404, 404]);
        expect(new Set(bodies.map(strip)).size).toBe(1);
      },
    );
  });

  it('answers 403 with a fixed problem body', async () => {
    const res = await get(url('settings:update'), VIEWER);

    expect(res.body).toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      detail: 'You do not have permission to perform this action.',
    });
  });

  it('answers 401 without a token, before any dealership check', async () => {
    const res = await get(
      url('vehicle:read', '00000000-0000-4000-8000-0000000000ff'),
    );

    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
  });

  it('gives non-member, missing and non-UUID dealerships the same 404', async () => {
    const bodies = await Promise.all(
      [NEW_YORK, '00000000-0000-4000-8000-0000000000ee', 'not-a-uuid'].map(
        (d) => get(url('vehicle:read', d), VIEWER),
      ),
    );

    for (const res of bodies) {
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        code: 'NOT_FOUND',
        detail: 'Resource not found.',
      });
    }
    const strip = (r: request.Response) => ({
      ...(r.body as object),
      instance: '',
    });
    expect(new Set(bodies.map((r) => JSON.stringify(strip(r)))).size).toBe(1);
  });

  it('puts role, thresholds and the dealership-local date on the request', async () => {
    // 23:30 UTC on 1 July is 00:30 on 2 July in London (BST) and 19:30 on 1 July in New York.
    const london = await get(url('vehicle:read'), MANAGER);
    const newYork = await get(url('vehicle:read', NEW_YORK), MANAGER);

    expect(london.body).toEqual({
      role: 'MANAGER',
      timezone: 'Europe/London',
      watchDays: 60,
      agingDays: 90,
      todayLocal: '2026-07-02',
    });
    expect(newYork.body).toEqual({
      role: 'MANAGER',
      timezone: 'America/New_York',
      watchDays: 45,
      agingDays: 75,
      todayLocal: '2026-07-01',
    });
  });

  it('applies a role change and a disabled user on the next request with the same token', async () => {
    expect((await get(url('vehicle:create'), VIEWER)).status).toBe(403);
    await sql(
      `UPDATE user_dealership SET role = 'MANAGER' WHERE user_id = $1 AND dealership_id = $2`,
      [VIEWER, LONDON],
    );
    expect((await get(url('vehicle:create'), VIEWER)).status).toBe(200);

    await sql(`UPDATE app_user SET status = 'DISABLED' WHERE id = $1`, [
      VIEWER,
    ]);
    expect((await get(url('vehicle:read'), VIEWER)).status).toBe(404);
  });

  it('logs user_id and dealership_id on guarded requests and warns on a failed login', async () => {
    const lines: Record<string, unknown>[] = [];
    const dest = new Writable({
      write(chunk: Buffer, _enc, cb) {
        for (const l of chunk.toString().split('\n').filter(Boolean)) {
          lines.push(JSON.parse(l) as Record<string, unknown>);
        }
        cb();
      },
    });
    const logged = await buildApp(
      container.getConnectionUri(),
      clock,
      [ProbeController],
      dest,
    );
    try {
      const server = request(logged.getHttpServer());
      await server
        .get(url('vehicle:read'))
        .set('Authorization', `Bearer ${tokenFor(ADMIN, clock)}`);
      await server
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.dev', password: 'wrong-password-123' });
    } finally {
      await logged.close();
    }

    expect(lines).toContainEqual(
      expect.objectContaining({
        level: 'info',
        user_id: ADMIN,
        dealership_id: LONDON,
      }),
    );
    const failed = lines.find((l) => l.status === 401);
    expect(failed).toMatchObject({ level: 'warn' });
    expect(JSON.stringify(failed)).not.toContain('admin@example.dev');
  });
});
