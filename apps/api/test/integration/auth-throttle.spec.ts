import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { buildApp, TestClock } from './support/auth.js';
import { expectProblem } from './support/problem.js';

describe('login throttling', () => {
  let app: INestApplication<App>;

  // The pool is lazy and the throttler runs before any query, so no database is needed.
  beforeAll(async () => {
    app = await buildApp('postgres://u:p@127.0.0.1:1/none', new TestClock());
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers the 11th attempt in a minute with 429 and Retry-After', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ nope: true });
    for (let i = 0; i < 10; i++) {
      expectProblem(await attempt(), 400, 'VALIDATION_FAILED');
    }

    const res = await attempt();

    expectProblem(res, 429, 'RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});
