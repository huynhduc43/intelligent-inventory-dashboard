import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PasswordService } from '../../src/modules/auth/password.service.js';
import { startMigratedPostgres } from './support/postgres.js';
import {
  ADMIN,
  buildApp,
  MANAGER,
  SEED_PASSWORD,
  seedDatabase,
  TestClock,
  tokenFor,
  VIEWER,
} from './support/auth.js';
import { expectProblem } from './support/problem.js';

const PROBLEM = /^application\/problem\+json/;
const b64 = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString('base64url');

describe('auth', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication<App>;
  const clock = new TestClock();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    container = await startMigratedPostgres();
    await seedDatabase(container.getConnectionUri());
    app = await buildApp(container.getConnectionUri(), clock);
  });

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  describe('POST /auth/login', () => {
    // Together with the cases below this stays under the throttler's 10 per minute.
    const login = (body: unknown) =>
      http()
        .post('/api/v1/auth/login')
        .send(body as object);

    it('returns a token with the documented claims and no role', async () => {
      const res = await login({
        email: 'admin@example.dev',
        password: SEED_PASSWORD,
      });

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toMatchObject({ expiresIn: 3600 });
      const token = (res.body as { accessToken: string }).accessToken;
      const jwt = new JwtService();
      expect(jwt.decode(token, { complete: true })).toMatchObject({
        header: { alg: 'HS256' },
        payload: {
          iss: 'inventory-api',
          aud: 'inventory-dashboard',
          sub: ADMIN,
          iat: Math.floor(clock.now().getTime() / 1000),
          exp: Math.floor(clock.now().getTime() / 1000) + 3600,
        },
      });
      expect(Object.keys(jwt.decode(token))).not.toContain('role');
    });

    it('matches the email case-insensitively', async () => {
      const res = await login({
        email: 'ADMIN@Example.dev',
        password: SEED_PASSWORD,
      });

      expect(res.status).toBe(200);
    });

    it('refuses a disabled user even when the dummy check passes', async () => {
      const pool = new pg.Client({
        connectionString: container.getConnectionUri(),
      });
      await pool.connect();
      await pool.query(
        `INSERT INTO app_user (email, display_name, password_hash, status)
         SELECT 'off2@example.dev', 'Off', password_hash, 'DISABLED' FROM app_user WHERE id = $1`,
        [ADMIN],
      );
      await pool.end();
      const stub = vi
        .spyOn(app.get(PasswordService), 'verifyDummy')
        .mockResolvedValue(true);

      const res = await login({
        email: 'off2@example.dev',
        password: SEED_PASSWORD,
      });

      stub.mockRestore();

      expectProblem(res, 401, 'INVALID_CREDENTIALS');
    });

    it('gives unknown email, wrong password and disabled user the same 401', async () => {
      const verifyDummy = vi.spyOn(app.get(PasswordService), 'verifyDummy');
      const pool = new pg.Client({
        connectionString: container.getConnectionUri(),
      });
      await pool.connect();
      await pool.query(
        `INSERT INTO app_user (email, display_name, password_hash, status)
         SELECT 'off@example.dev', 'Off', password_hash, 'DISABLED' FROM app_user WHERE id = $1`,
        [ADMIN],
      );
      await pool.end();

      const unknown = await login({
        email: 'nobody@example.dev',
        password: SEED_PASSWORD,
      });
      expect(verifyDummy).toHaveBeenCalledTimes(1);
      const wrong = await login({
        email: 'admin@example.dev',
        password: 'not-the-password',
      });
      const disabled = await login({
        email: 'off@example.dev',
        password: SEED_PASSWORD,
      });

      expect(verifyDummy).toHaveBeenCalledTimes(2);

      for (const res of [unknown, wrong, disabled]) {
        expect(res.status).toBe(401);
        expect(res.headers['content-type']).toMatch(PROBLEM);
        expect(res.headers['www-authenticate']).toBe('Bearer');
        expect(res.body).toMatchObject({
          code: 'INVALID_CREDENTIALS',
          detail: 'Invalid email or password.',
        });
      }
      const strip = (r: request.Response) => ({
        ...(r.body as object),
        instance: '',
      });
      expect(strip(wrong)).toEqual(strip(unknown));
      expect(strip(disabled)).toEqual(strip(unknown));
    });

    it('rejects an unknown or missing field with 400', async () => {
      const unknown = await login({
        email: 'a@b.dev',
        password: 'x',
        extra: 1,
      });
      const missing = await login({ email: 'a@b.dev' });

      for (const res of [unknown, missing]) {
        expectProblem(res, 400, 'VALIDATION_FAILED');
        expect(
          (res.body as { errors: unknown[] }).errors.length,
        ).toBeGreaterThan(0);
      }
    });

    it('rejects a NUL in email and password with 400', async () => {
      const res = await login({ email: 'a\u0000@b.dev', password: 'x\u0000y' });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        errors: [{ pointer: '/email' }, { pointer: '/password' }],
      });
    });

    it('answers 401, not 400, for a 5-character password', async () => {
      const res = await login({
        email: 'admin@example.dev',
        password: 'short',
      });

      expectProblem(res, 401, 'INVALID_CREDENTIALS');
    });
  });

  describe('token verification on GET /me', () => {
    const me = (authorization?: string) => {
      const r = http().get('/api/v1/me');
      return authorization ? r.set('Authorization', authorization) : r;
    };
    const hs512 = tokenFor(ADMIN, clock, {}, 'HS512');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
      sub: ADMIN,
      iss: 'inventory-api',
      aud: 'inventory-dashboard',
      exp: 9_999_999_999,
    })}.`;

    it.each([
      ['no header', undefined],
      ['garbage', 'Bearer not.a.token'],
      ['wrong scheme', 'Basic abc'],
      ['HS512', `Bearer ${hs512}`],
      ['alg none', `Bearer ${none}`],
      ['wrong issuer', `Bearer ${tokenFor(ADMIN, clock, { iss: 'other' })}`],
      ['wrong audience', `Bearer ${tokenFor(ADMIN, clock, { aud: 'other' })}`],
      ['missing sub', `Bearer ${tokenFor(ADMIN, clock, { sub: undefined })}`],
    ])('rejects %s with 401', async (_name, header) => {
      const res = await me(header);

      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toBe('Bearer');
      expect(res.headers['content-type']).toMatch(PROBLEM);
      expect(res.body).toMatchObject({
        code: 'UNAUTHENTICATED',
        detail: 'Authentication is required.',
      });
    });

    it('rejects a token past exp (clock pinned)', async () => {
      const token = tokenFor(ADMIN, clock);
      const later = new Date(clock.now().getTime() + 3601_000);
      const before = clock.current;
      clock.current = later;
      try {
        const res = await me(`Bearer ${token}`);
        expectProblem(res, 401, 'UNAUTHENTICATED');
      } finally {
        clock.current = before;
      }
    });
  });

  describe('GET /me', () => {
    it('accepts the Bearer scheme in any case', async () => {
      const res = await http()
        .get('/api/v1/me')
        .set('Authorization', `bearer ${tokenFor(ADMIN, clock)}`);

      expect(res.status).toBe(200);
    });

    const me = (id: string) =>
      http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${tokenFor(id, clock)}`);
    const READ = [
      'vehicle:read',
      'dashboard:read',
      'vehicle_action:read',
      'settings:read',
    ];
    const WRITE = [
      'vehicle:create',
      'vehicle:change_status',
      'vehicle_action:create',
    ];

    it.each([
      [
        ADMIN,
        'admin@example.dev',
        [
          ['London', 'ADMIN'],
          ['New York', 'ADMIN'],
          ['Sydney', 'ADMIN'],
        ],
      ],
      [
        MANAGER,
        'manager@example.dev',
        [
          ['London', 'MANAGER'],
          ['New York', 'MANAGER'],
        ],
      ],
      [VIEWER, 'viewer@example.dev', [['London', 'VIEWER']]],
    ])(
      'returns user and memberships for %s',
      async (id, email, memberships) => {
        const res = await me(id);

        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toBe('no-store');
        const body = res.body as {
          user: unknown;
          memberships: { name: string; role: string; permissions: string[] }[];
        };
        expect(body.user).toMatchObject({ id, email });
        expect(body.memberships.map((m) => [m.name, m.role])).toEqual(
          memberships,
        );
        for (const m of body.memberships) {
          expect(m.permissions).toEqual(
            m.role === 'ADMIN'
              ? [...READ, ...WRITE, 'settings:update']
              : m.role === 'MANAGER'
                ? [...READ, ...WRITE]
                : READ,
          );
        }
      },
    );

    it('answers 401 for a user that does not exist or is disabled', async () => {
      const gone = await me('00000000-0000-4000-8000-00000000ffff');
      expectProblem(gone, 401, 'UNAUTHENTICATED');

      const client = new pg.Client({
        connectionString: container.getConnectionUri(),
      });
      await client.connect();
      await client.query(
        `UPDATE app_user SET status = 'DISABLED' WHERE id = $1`,
        [VIEWER],
      );
      const disabled = await me(VIEWER);
      await client.query(
        `UPDATE app_user SET status = 'ACTIVE' WHERE id = $1`,
        [VIEWER],
      );
      await client.end();

      expectProblem(disabled, 401, 'UNAUTHENTICATED');
    });
  });
});
