import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { startMigratedPostgres, testConfig } from './support/postgres.js';

describe('health', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication<App>;

  beforeAll(async () => {
    container = await startMigratedPostgres();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(testConfig(container.getConnectionUri()))],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('with the database up', () => {
    it('GET /health/live answers 200', async () => {
      const res = await request(app.getHttpServer()).get('/health/live');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ok' });
    });

    it('GET /health/ready answers 200 with the database up', async () => {
      const res = await request(app.getHttpServer()).get('/health/ready');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'ok',
        info: { database: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' } },
      });
    });
  });

  // Runs last: it stops the container for good.
  describe('with the database stopped', () => {
    beforeAll(async () => {
      await container.stop();
    });

    it('GET /health/ready answers 503 without leaking the driver error', async () => {
      const res = await request(app.getHttpServer()).get('/health/ready');

      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        status: 'error',
        info: {},
        error: { database: { status: 'down' } },
        details: { database: { status: 'down' } },
      });
    }, 5000);

    it('GET /health/live still answers 200', async () => {
      const res = await request(app.getHttpServer()).get('/health/live');

      expect(res.status).toBe(200);
    });
  });
});
