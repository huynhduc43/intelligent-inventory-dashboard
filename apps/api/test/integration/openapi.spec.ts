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

  it('lists the auth, actions, dashboard, settings, inventory and health routes', () => {
    expect(Object.keys(generated.paths).sort()).toEqual([
      '/api/v1/auth/login',
      '/api/v1/dealerships/{dealershipId}/dashboard',
      '/api/v1/dealerships/{dealershipId}/settings',
      '/api/v1/dealerships/{dealershipId}/vehicles',
      '/api/v1/dealerships/{dealershipId}/vehicles/{vehicleId}',
      '/api/v1/dealerships/{dealershipId}/vehicles/{vehicleId}/actions',
      '/api/v1/dealerships/{dealershipId}/vehicles/{vehicleId}/status',
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
      example: expect.objectContaining({
        status: 401,
        code: 'UNAUTHENTICATED',
      }) as unknown,
    });
    expect(generated.components?.schemas?.Problem).toMatchObject({
      type: 'object',
      required: ['type', 'title', 'status', 'detail', 'instance', 'code'],
    });
  });

  // Without an example, Swagger UI samples Problem.status from its range and shows 599 on every error.
  it('gives every problem+json response an example whose status is its own', () => {
    const mismatches = Object.entries(generated.paths).flatMap(([path, ops]) =>
      Object.entries(
        ops as Record<
          string,
          {
            responses: Record<
              string,
              { content?: Record<string, { example?: { status?: number } }> }
            >;
          }
        >,
      ).flatMap(([method, op]) =>
        Object.entries(op.responses).flatMap(([status, response]) => {
          const problem = response.content?.['application/problem+json'];
          return problem && problem.example?.status !== Number(status)
            ? [`${method.toUpperCase()} ${path} ${status}`]
            : [];
        }),
      ),
    );
    expect(mismatches).toEqual([]);
  });
});

describe('openapi named components', () => {
  interface Ref {
    $ref: string;
  }
  const walk = (v: unknown, f: (o: Record<string, unknown>) => void): void => {
    if (Array.isArray(v))
      v.forEach((x) => {
        walk(x, f);
      });
    else if (v && typeof v === 'object') {
      f(v as Record<string, unknown>);
      Object.values(v).forEach((x) => {
        walk(x, f);
      });
    }
  };
  let doc: Doc;
  beforeAll(async () => {
    doc = JSON.parse(JSON.stringify(await generateOpenApi())) as Doc;
  });
  const ops = () =>
    Object.entries(doc.paths)
      .filter(([path]) => path.startsWith('/api/v1'))
      .flatMap(([, item]) => Object.values(item as Record<string, never>)) as {
      requestBody?: { content: Record<string, { schema: unknown }> };
      responses: Record<
        string,
        { content?: Record<string, { schema: unknown }> }
      >;
    }[];
  const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });

  it('refers to a named component from every request body', () => {
    const bodies = ops().flatMap((o) =>
      o.requestBody ? [o.requestBody.content['application/json']?.schema] : [],
    );
    expect(bodies).toHaveLength(5);
    for (const b of bodies)
      expect(JSON.stringify(b)).toMatch(
        /^\{"\$ref":"#\/components\/schemas\/\w+"\}$/,
      );
  });

  it('refers to a named component from every 2xx response body', () => {
    const schemas = ops().flatMap((o) =>
      Object.entries(o.responses)
        .filter(([s]) => s.startsWith('2'))
        .flatMap(([, r]) =>
          r.content ? [r.content['application/json']?.schema] : [],
        ),
    );
    expect(schemas.length).toBeGreaterThanOrEqual(9);
    for (const s of schemas) expect(s).toHaveProperty('$ref');
  });

  it('resolves every $ref to a component', () => {
    const names = new Set(Object.keys(doc.components?.schemas ?? {}));
    walk(doc, (o) => {
      if (typeof o.$ref === 'string')
        expect(names.has(o.$ref.replace('#/components/schemas/', ''))).toBe(
          true,
        );
    });
  });

  it('registers exactly the documented names', () => {
    expect(Object.keys(doc.components?.schemas ?? {}).sort()).toEqual(
      [
        'AccessToken',
        'Action',
        'ActionList',
        'CreateVehicleRequest',
        'Dashboard',
        'LogActionRequest',
        'LoginRequest',
        'Me',
        'Problem',
        'Settings',
        'ChangeVehicleStatusRequest',
        'UpdateSettingsRequest',
        'Vehicle',
        'VehicleList',
      ].sort(),
    );
  });

  it('lists elements by reference', () => {
    const s = doc.components?.schemas as Record<
      string,
      { properties: { items: { items: Ref } } }
    >;
    expect(s.VehicleList?.properties.items.items).toEqual(ref('Vehicle'));
    expect(s.ActionList?.properties.items.items).toEqual(ref('Action'));
  });
});

describe('openapi per-route statuses', () => {
  it('documents only the statuses each route can return', async () => {
    const doc = JSON.parse(JSON.stringify(await generateOpenApi())) as Doc;
    const statuses = (path: string, method: 'get' | 'post' | 'patch') =>
      Object.keys(doc.paths[path]?.[method]?.responses ?? {}).sort();
    expect(statuses('/api/v1/auth/login', 'post')).toEqual([
      '200',
      '400',
      '401',
      '429',
      '500',
    ]);
    expect(statuses('/api/v1/me', 'get')).toEqual(['200', '401', '500']);
    expect(
      statuses(
        '/api/v1/dealerships/{dealershipId}/vehicles/{vehicleId}/status',
        'patch',
      ),
    ).toEqual(['200', '400', '401', '403', '404', '409', '500']);
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
