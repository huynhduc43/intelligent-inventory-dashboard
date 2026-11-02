# OpenAPI docs and a committed `openapi.json` (research for the README/OpenAPI work)

Research for serving Swagger UI at `/docs` (§4.7) and committing an exported `openapi.json`. Four findings shape the design. (1) `@nestjs/swagger@12.0.5` (npm `latest`) peers on `@nestjs/core ^12`, `@nestjs/common ^12` and `typescript ^5.5 || ^6`, is ESM (`"type": "module"`), and needs no new dependency beyond itself. (2) The swagger scanner reads the `RouterModule` path, so the existing `api/v1` mount appears in the document; `/health/*` is **not** under `/api/v1` and shows up as `/health/...`. (3) swagger 12 converts a Standard Schema passed to `@Body({ schema })` by itself, so request bodies need no extra decorator; **responses** do not get this treatment (a zod `type:` yields an empty `$ref`), so the problem+json shape needs one hand-registered component. (4) `SwaggerModule.createDocument(app, config)` works on an app that was created but never listened, so the document can be exported by a script.

Method: registry data from `npm view @nestjs/swagger` and `@nestjs/core`; the published tarballs of `@nestjs/swagger@12.0.5` and `@nestjs/cli@12.0.11` (`npm pack`, file and line references below are to those packages); the repo files named in §1; and a throwaway Nest 12.3.2 + zod 4.6.7 + swagger 12.0.5 probe kept outside the repo (scratchpad), run under Node 24. The probe did not use the repo's `AppModule`, so DB-free boot of that module is untested (Q2).

## 1. How routes are mounted today

- No `setGlobalPrefix`. `AppModule` registers `RouterModule.register([{ path: 'api/v1', module: AuthModule }])`, so `POST /api/v1/auth/login` and `GET /api/v1/me` carry the prefix (`apps/api/src/app.module.ts:28`, `auth.controller.ts`).
- `HealthController` is `@Controller('health')` in `HealthModule`, which has no router path, so `GET /health/live` and `/health/ready` are **outside** `/api/v1`. They are `@Public()` and use `HealthPassthroughFilter` (`health.controller.ts`), so they return the terminus body, not problem+json.
- Request bodies are validated by Nest 12's `StandardSchemaValidationPipe` with a zod `z.strictObject`; a route opts in with `@Body({ schema })` (`shared.module.ts:34-36`, `auth.controller.ts`, ADR 0005).
- Problem shape: `{ type, title, status, detail, instance, code, errors?: [{ pointer, message }] }` (`apps/api/src/shared/problem.ts`, `Problem` interface). There is no zod schema for it today.

## 2. `@nestjs/swagger` and the build

- **Version.** `@nestjs/swagger@12.0.5`: peers `@nestjs/core ^12.0.0`, `@nestjs/common ^12.0.0`, `typescript ^5.5.0 || ^6.0.0`, `reflect-metadata ^0.1.12 || ^0.2.0`; `class-validator`, `class-transformer`, `@fastify/static` are listed as peers but optional in use (`npm view @nestjs/swagger peerDependencies`). `"type": "module"`, `main: dist/index.js` (`package.json`). The probe imported it from ESM next to `@nestjs/core@12.3.2` without error. Repo pins `typescript ~6.0.3`, inside the peer range.
- **Standard Schema support is built in.** `dist/services/standard-schema-openapi.converter.js` calls `schema['~standard'].jsonSchema[schemaType]({ target: 'openapi-3.0' })` and rewrites `#/$defs/` refs to `#/components/schemas/`. `dist/explorers/api-parameters.explorer.js:22,46` expands a `standardSchema` body/param. Probe: `@Body({ schema: loginSchema })` produced a full `requestBody` (`email`, `password`, `minLength`, `maxLength`, `required`, `additionalProperties: false`) with no swagger decorator on the body.
- **Nest CLI plugin.** `@nestjs/cli@12.0.11` defaults to the `tsc` builder (`dist/lib/configuration/defaults.js`: `builder.type: 'tsc'`), and `apps/api/nest-cli.json` sets no builder, so `nest build` goes through tsc and plugins can load (`lib/compiler/plugins/plugins-loader.js` resolves them with `require`; the swagger plugin entry is ESM, which `require` loads on Node 24; **not run**). The plugin only infers schemas from **DTO classes** (properties, `class-validator` decorators). This repo has no DTO classes, so the plugin would add nothing. Skip it.
- **tsconfig.** `apps/api/tsconfig.json` already has `experimentalDecorators` and `emitDecoratorMetadata`, which swagger's decorators need. No change.

## 3. Serving `/docs` and the raw JSON

- `SwaggerModule.setup('docs', app, document)` serves the UI at `/docs` and the JSON at `/docs-json` (YAML at `/docs-yaml`); `raw` defaults to `true` (`dist/swagger-module.js:249-269`). Probe: `/docs` 200, `/docs-json` 200.
- **Global prefix interplay.** The doc routes are not prefixed unless `useGlobalPrefix: true` is passed with a global prefix set (`swagger-module.js:249,253`). The repo has no global prefix (it uses `RouterModule`), so `/docs` and `/docs-json` sit at the root, matching "OpenAPI at `/docs`" in §4.7. The probe with `setGlobalPrefix('api/v1', { exclude: ['health/live'] })` showed the same pattern: the prefixed routes got `/api/v1/...` paths in the document, the excluded one stayed `/health/live`, and `/docs-json` stayed at the root.
- **RouterModule paths are honoured.** `swagger-scanner.js:121` reads `MODULE_PATH` metadata, which `RouterModule.register` sets, so the document paths come out as `/api/v1/auth/login` and `/api/v1/me` without `setGlobalPrefix`. (Probe used `setGlobalPrefix`; the `MODULE_PATH` read is from source, not run.)
- **Auth guard on the docs routes.** `JwtAuthGuard` is global (see `auth` module); the swagger routes are registered on the HTTP adapter directly (`httpAdapter.get`, `swagger-module.js:221`), outside Nest's guard pipeline, so they should need no `@Public()`. Not run against the repo app; check in the integration test.
- **Where to call it.** `configureApp` is shared by `main.ts` and the integration tests, so putting `setup` there would also mount `/docs` in every test. Safer: a small `setupDocs(app)` called only from `main.ts`, and a separate builder used by the export script.

## 4. Exporting `openapi.json` deterministically

- Option A, `GET /docs-json` on a running app: needs the DB and env (`loadConfig`) and a free port, and the output depends on a live server.
- Option B, a script: `NestFactory.create(AppModule.forRoot(config), { logger: false })`, `configureApp`-free, `SwaggerModule.createDocument(app, cfg)`, `writeFileSync('openapi.json', JSON.stringify(doc, null, 2) + '\n')`, `app.close()`, never `listen`. The probe built the document before `app.init()` and without `listen`. `JSON.stringify` of the document is stable across runs (key order follows decorator and route registration order).
- **Open point.** Whether `AppModule` boots without a reachable Postgres (does `SharedModule` create the `pg` Pool lazily and does `DatabaseHealthIndicator` connect on construction?) is not verified. If it connects eagerly, the script needs a dummy `DATABASE_URL` (pool creation in `pg` is lazy; the first query connects) or an override. Check when implementing.
- **Drift guard.** Add a test (unit or CI step) that regenerates the document and diffs it with the committed file, so the committed `openapi.json` cannot go stale. Output also embeds `info.version`; take it from `package.json` or pin it, so the diff is stable.

## 5. Describing zod bodies and problem+json without duplicating schemas

| Option                                                                  | Verdict                                                                                                                                                              |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rely on swagger 12's Standard Schema support for bodies (probe)         | Works, zero extra code, and uses the same `loginSchema` the pipe validates. Use for request bodies, queries and path params.                                          |
| `ApiResponse({ type: zodSchema })` (probe)                              | Does **not** work: yields `"$ref": "#/components/schemas/"` with empty `components`, even with `.meta({ id })`. Do not use.                                          |
| `ApiResponse({ content: { ...: { schema: z.toJSONSchema(s, ...) } } })` | Works for inline schemas, but a `.meta({ id })` schema comes out as `$ref: '#/definitions/...'` with nested `definitions` that is invalid in OpenAPI. Avoid `.meta({ id })` here. |
| Register one component and `$ref` it (probe)                            | Works: after `createDocument`, set `document.components.schemas.Problem = z.toJSONSchema(Problem, { target: 'openapi-3.0' })` and reference `{ $ref: '#/components/schemas/Problem' }`. One zod schema, no duplication. |
| `nestjs-zod`                                                            | Not needed given the above; it would be a new dependency and a second pipe.                                                                                           |

- `z.toJSONSchema` (zod 4.6.7) accepts `target: 'openapi-3.0'`; the probe confirmed. `z.int()` renders as `integer` with `minimum`/`maximum` of ±2^53-1 in that output; use `z.number().int().min(100).max(599)` for `status` to keep the document readable.
- **Cost.** To get a `Problem` zod schema, `problem.ts` needs one: define `problemSchema` next to the `Problem` interface and make the interface `z.infer` of it (one source), or write the schema in the docs file and accept a small duplication of the interface. The first keeps one shape.
- **Applying it to every route.** `DocumentBuilder#addGlobalResponse(...ApiResponseOptions[])` (`dist/document-builder.d.ts:24`) adds the same responses to all operations; use it for 400/401/403/404/429/500 as `application/problem+json` pointing to the `Problem` component. The login route is public and has no 403, and the health routes pass through terminus, so a global response over-documents; either accept that or add the specific ones per route with `ApiResponse`.

## 6. Minimal decorators for today's routes

- `DocumentBuilder().setTitle(...).setVersion(...).addBearerAuth().build()`; `addBearerAuth()` registers a `bearer` security scheme (probe: operations get `"security": [{ "bearer": [] }]`).
- `AuthController`: `@ApiTags('auth')` on the class; `login`: `@ApiOkResponse` describing the token response (inline schema, or none) and no `@ApiBearerAuth` (public). `me`: `@ApiBearerAuth()` plus an `@ApiOkResponse`. Because `JwtAuthGuard` is global, apply `@ApiBearerAuth()` per protected route (or on the class for a controller of protected routes), not globally, or the public routes would show a lock.
- `HealthController`: `@ApiTags('health')` and, since it already carries `@Public()`, nothing else; terminus gives no response schema, so `@ApiOkResponse` with a small inline schema is optional.
- Without any response decorator the document shows `200` (or `201` for `POST`) with an empty description (probe). Note `login` has `@HttpCode(200)`; swagger reads it (probe: `HttpCode(200)` honoured).
- Operation ids come out as `AuthController_login` style (probe: `C_login`); fine for now.

## Decisions

1. Add `@nestjs/swagger@^12.0.5` as the only new dependency (peers satisfied; the user's rule is to ask before adding one). Recommend: yes.
2. Skip the Nest CLI swagger plugin: no DTO classes to introspect, and the `tsc` builder is unchanged. Recommend: skip.
3. Mount `/docs` and `/docs-json` at the root (no global prefix, `RouterModule` stays), via a `setupDocs(app)` called only from `main.ts`, not from `configureApp`. Recommend: yes, so tests do not mount the UI.
4. Leave `/health/*` where it is (outside `/api/v1`) and document it under its real path, tag `health`. Recommend: leave it; moving it breaks orchestrator probes.
5. Request bodies: rely on swagger 12's Standard Schema support through `@Body({ schema })`, with no extra decorators. Recommend: yes.
6. Problem+json: define a `problemSchema` in `shared/problem.ts`, derive the `Problem` type from it, register it as `components.schemas.Problem` with `z.toJSONSchema(..., { target: 'openapi-3.0' })`, and `$ref` it with `application/problem+json`. Recommend: yes; do not use `ApiResponse({ type })` or `.meta({ id })`.
7. Apply common error responses with `DocumentBuilder#addGlobalResponse` for 400/401/500 and per-route `ApiResponse` for 403/404/429. Recommend: yes; avoids a lock on public routes only if bearer auth is applied per route.
8. Bearer auth: `addBearerAuth()` in the builder and `@ApiBearerAuth()` on `me` (and on future protected controllers), not global. Recommend: per route.
9. Export through a script (`pnpm --filter @inventory/api openapi:export`) that builds the app with `NestFactory.create` and `createDocument`, never `listen`, then writes `docs/openapi.json` (stable `JSON.stringify(doc, null, 2)`). Recommend: script, not `GET /docs-json`; verify first that `AppModule` boots without a reachable DB.
10. Add a drift check (test or CI step) that regenerates the document and compares it with the committed file. Recommend: yes, as a unit/integration test so `pnpm verify` catches it.
11. Pin `info.version` from `apps/api/package.json` (or a constant) so the export is byte-stable. Recommend: read it from `package.json`.
12. Record the choices as a short ADR (supersedes nothing; extends §4.7 "OpenAPI at `/docs`") and list it in `docs/adr/README.md`. Recommend: yes.
