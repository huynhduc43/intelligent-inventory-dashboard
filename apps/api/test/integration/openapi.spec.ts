import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { generateOpenApi, setupDocs } from '../../src/shared/docs.js';
import { testConfig } from './support/postgres.js';

type Doc = Awaited<ReturnType<typeof generateOpenApi>>;

const committed = JSON.parse(
  readFileSync(
    `${import.meta.dirname}/../../../../docs/api/openapi.json`,
    'utf8',
  ),
) as Awaited<ReturnType<typeof generateOpenApi>>;

describe('openapi document', () => {
  let generated: Awaited<ReturnType<typeof generateOpenApi>>;

  beforeAll(async () => {
    generated = JSON.parse(JSON.stringify(await generateOpenApi())) as Doc;
  });

  it('equals the committed docs/api/openapi.json (run pnpm --filter @inventory/api openapi:export)', () => {
    expect(generated).toEqual(committed);
  });

  it('lists the auth, actions, dashboard, inventory and health routes', () => {
    expect(Object.keys(generated.paths).sort()).toEqual([
      '/api/v1/auth/login',
      '/api/v1/dealerships/{dealershipId}/dashboard',
      '/api/v1/dealerships/{dealershipId}/vehicles',
      '/api/v1/dealerships/{dealershipId}/vehicles/{vehicleId}',
      '/api/v1/dealerships/{dealershipId}/vehicles/{vehicleId}/actions',
      '/api/v1/me',
      '/health/live',
      '/health/ready',
    ]);
  });

  it('keeps login public and requires bearer on me', () => {
    expect(
      generated.paths['/api/v1/auth/login']?.post?.security,
    ).toBeUndefined();
    expect(generated.paths['/api/v1/me']?.get?.security).toEqual([
      { bearer: [] },
    ]);
  });

  it('describes errors as problem+json referencing the Problem component', () => {
    const content = generated.paths['/api/v1/me']?.get?.responses['401'] as {
      content: Record<string, unknown>;
    };
    expect(content.content['application/problem+json']).toEqual({
      schema: { $ref: '#/components/schemas/Problem' },
    });
    expect(generated.components?.schemas?.Problem).toMatchObject({
      type: 'object',
      required: ['type', 'title', 'status', 'detail', 'instance', 'code'],
    });
  });
});

describe('openapi per-route statuses', () => {
  it('documents only the statuses each route can return', async () => {
    const doc = JSON.parse(JSON.stringify(await generateOpenApi())) as Doc;
    const statuses = (path: string, method: 'get' | 'post') =>
      Object.keys(doc.paths[path]?.[method]?.responses ?? {}).sort();
    expect(statuses('/api/v1/auth/login', 'post')).toEqual([
      '200',
      '400',
      '401',
      '429',
      '500',
    ]);
    expect(statuses('/api/v1/me', 'get')).toEqual(['200', '401', '500']);
    expect(statuses('/health/live', 'get')).not.toContain('401');
    expect(statuses('/health/ready', 'get')).not.toContain('400');
  });
});

describe('openapi vehicle routes', () => {
  it('lists each list query parameter as an integer, enum or string', async () => {
    const doc = JSON.parse(JSON.stringify(await generateOpenApi())) as Doc;
    const op = doc.paths['/api/v1/dealerships/{dealershipId}/vehicles']?.get;
    const params = (op?.parameters ?? []) as {
      name: string;
      in: string;
      style?: string;
      explode?: boolean;
      schema?: {
        type?: string;
        minimum?: number;
        enum?: string[];
        default?: unknown;
      };
    }[];
    const query = Object.fromEntries(
      params.filter((p) => p.in === 'query').map((p) => [p.name, p.schema]),
    );

    expect(Object.keys(query).sort()).toEqual(
      [
        'hasAction',
        'limit',
        'make',
        'maxAgeDays',
        'minAgeDays',
        'model',
        'offset',
        'sort',
        'status',
        'tier',
      ].sort(),
    );
    const byName = Object.fromEntries(params.map((p) => [p.name, p]));
    expect(byName.status).toMatchObject({
      style: 'form',
      explode: false,
      schema: { default: 'IN_STOCK' },
    });
    expect(byName.limit?.schema).toMatchObject({ default: 50 });
    expect(byName.offset?.schema).toMatchObject({ default: 0 });
    expect(query.limit).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 100,
    });
    expect(query.hasAction?.enum).toEqual(['true', 'false']);
    expect(Object.keys(op?.responses ?? {}).sort()).toEqual([
      '200',
      '400',
      '401',
      '404',
      '500',
    ]);
  });
});

describe('setupDocs', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.forRoot(testConfig('postgres://u:p@localhost:5432/none')),
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    setupDocs(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves /docs and /docs-json without a token', async () => {
    const ui = await request(app.getHttpServer()).get('/docs');
    expect(ui.status).toBe(200);
    expect(ui.headers['content-type']).toMatch(/html/);
    const json = await request(app.getHttpServer()).get('/docs-json');
    expect(json.status).toBe(200);
    expect(json.body).toEqual(committed);
  });
});
