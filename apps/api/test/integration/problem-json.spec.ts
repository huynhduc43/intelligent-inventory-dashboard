import { Writable } from 'node:stream';
import {
  Body,
  Controller,
  Get,
  type INestApplication,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { z } from 'zod';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/configure-app.js';
import { testConfig } from './support/postgres.js';

interface LogLine {
  req_id?: string;
  time?: string;
  duration_ms?: unknown;
  err?: { message: string; stack: string };
}
interface ProblemBody {
  detail: string;
  title: string;
  errors?: { pointer: string; message: string }[];
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PROBLEM = /^application\/problem\+json/;

const schema = z.strictObject({
  status: z.enum(['IN_STOCK', 'RESERVED', 'SOLD']),
  password: z.string().optional(),
});

@Controller('test')
class TestController {
  @Post('validate')
  validate(@Body({ schema }) body: z.infer<typeof schema>) {
    return body;
  }

  @Get('boom')
  boom() {
    throw new Error('pg: connection refused at 10.0.0.5');
  }
}

describe('problem+json and request logging', () => {
  let app: INestApplication<App>;
  const lines: LogLine[] = [];
  const logLine = (id: string) => {
    const own = lines.filter((l) => l.req_id === id);
    expect(own).toHaveLength(1);
    return own[0];
  };

  beforeAll(async () => {
    const dest = new Writable({
      write(chunk: Buffer, _enc, cb) {
        for (const l of chunk.toString().split('\n').filter(Boolean)) {
          lines.push(JSON.parse(l) as LogLine);
        }
        cb();
      },
    });
    // The pool is lazy and nothing here queries, so no database is needed.
    const config = testConfig('postgres://u:p@127.0.0.1:1/none', {
      LOG_LEVEL: 'info',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(config, dest)],
      controllers: [TestController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, config, dest);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const expectProblem = (
    res: request.Response,
    status: number,
    code: string,
  ) => {
    const id = String(res.headers['x-request-id']);
    expect(res.status).toBe(status);
    expect(res.headers['content-type']).toMatch(PROBLEM);
    expect(res.body).toMatchObject({
      status,
      code,
      instance: `urn:request:${id}`,
      type: `https://api.example.dev/problems/${code.toLowerCase().replaceAll('_', '-')}`,
    });
    return id;
  };

  it('404 for an unknown route, with one info log line', async () => {
    const res = await request(app.getHttpServer()).get('/no-such-route');

    const id = expectProblem(res, 404, 'NOT_FOUND');
    expect(res.body).toMatchObject({
      title: 'Not Found',
      detail: 'Cannot GET /no-such-route',
    });
    expect(logLine(id)).toMatchObject({
      level: 'info',
      msg: 'request completed',
      route: '/no-such-route',
      method: 'GET',
      status: 404,
    });
    expect(typeof logLine(id)?.duration_ms).toBe('number');
    expect(logLine(id)?.time).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it('400 with errors[] for a validation failure, one item per unknown key', async () => {
    const res = await request(app.getHttpServer())
      .post('/test/validate')
      .set('X-Request-ID', 'abc-123')
      .send({ status: 'PARKED', extra: 1 });

    expect(expectProblem(res, 400, 'VALIDATION_FAILED')).toBe('abc-123');
    expect((res.body as ProblemBody).detail).toBe('Request validation failed.');
    expect((res.body as ProblemBody).errors).toHaveLength(2);
    expect((res.body as ProblemBody).errors?.[0]?.pointer).toBe('/status');
    expect((res.body as ProblemBody).errors?.[1]).toEqual({
      pointer: '/extra',
      message: 'Unrecognized key: "extra"',
    });
    expect(logLine('abc-123')).toMatchObject({
      status: 400,
      level: 'info',
      route: '/test/validate',
    });
    expect(logLine('abc-123')?.err).toBeUndefined();
  });

  it('accepts a valid body', async () => {
    const res = await request(app.getHttpServer())
      .post('/test/validate')
      .send({ status: 'SOLD' });

    expect(res.status).toBe(201);
    expect(res.headers['x-request-id']).toMatch(UUID);
  });

  it('400 for malformed JSON, with a request id and a log line', async () => {
    const res = await request(app.getHttpServer())
      .post('/health/live')
      .set('Content-Type', 'application/json')
      .send('{bad');

    const id = expectProblem(res, 400, 'VALIDATION_FAILED');
    expect((res.body as ProblemBody).detail).toBe(
      'Request body is not valid JSON.',
    );
    expect((res.body as ProblemBody).errors).toBeUndefined();
    expect(logLine(id)).toMatchObject({
      status: 400,
      route: '/health/live',
      method: 'POST',
    });
  });

  it('413 for a body over the limit', async () => {
    const res = await request(app.getHttpServer())
      .post('/health/live')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ a: 'x'.repeat(101 * 1024) }));

    const id = expectProblem(res, 413, 'HTTP_413');
    expect(res.body).toMatchObject({
      title: 'Payload Too Large',
      detail: 'request entity too large',
    });
    expect(logLine(id)).toMatchObject({ status: 413 });
  });

  it('404 for valid JSON posted to a route that does not exist', async () => {
    const res = await request(app.getHttpServer())
      .post('/health/live')
      .send({ a: 1 });

    expectProblem(res, 404, 'NOT_FOUND');
  });

  it('500 hides the error and logs it with its stack at level error', async () => {
    const res = await request(app.getHttpServer()).get('/test/boom');

    const id = expectProblem(res, 500, 'INTERNAL');
    expect((res.body as ProblemBody).detail).toBe(
      'An unexpected error occurred.',
    );
    expect(JSON.stringify(res.body)).not.toMatch(/pg:|10\.0\.0\.5|stack| at /);
    expect(logLine(id)).toMatchObject({
      level: 'error',
      msg: 'request errored',
      status: 500,
    });
    expect(logLine(id)?.err?.message).toBe(
      'pg: connection refused at 10.0.0.5',
    );
    expect(logLine(id)?.err?.stack).toContain('boom');
  });

  describe('X-Request-ID', () => {
    it('is generated on a success response', async () => {
      const res = await request(app.getHttpServer()).get('/health/live');

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toMatch(UUID);
    });

    it.each(['a b', 'a'.repeat(129)])(
      'replaces an invalid incoming id (%#) without a 400',
      async (bad) => {
        const res = await request(app.getHttpServer())
          .get('/no-such-route')
          .set('X-Request-ID', bad);

        expect(expectProblem(res, 404, 'NOT_FOUND')).toMatch(UUID);
      },
    );
  });

  it('writes no line for a successful health probe, and keeps the Terminus body', async () => {
    const res = await request(app.getHttpServer()).get('/health/live');

    expect(res.body).toEqual({
      status: 'ok',
      info: {},
      error: {},
      details: {},
    });
    expect(res.headers['content-type']).not.toMatch(PROBLEM);
    const id = String(res.headers['x-request-id']);
    expect(lines.filter((l) => l.req_id === id)).toHaveLength(0);
  });

  it('logs a 404 for an unknown path under /health/', async () => {
    const res = await request(app.getHttpServer()).get('/health/no-such');

    const id = expectProblem(res, 404, 'NOT_FOUND');
    expect(logLine(id)).toMatchObject({ level: 'info', status: 404 });
  });

  it('does not log credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/test/validate')
      .set('Authorization', 'Bearer topsecret')
      .send({ status: 'SOLD', password: 'hunter2' });

    expect(res.status).toBe(201);
    const raw = JSON.stringify(lines);
    expect(raw).not.toContain('topsecret');
    expect(raw).not.toContain('hunter2');
  });
});
