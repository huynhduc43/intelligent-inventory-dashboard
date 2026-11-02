# Vehicle list and detail building blocks (research for #9)

Research for issue #9 (§4.4, §4.7, §4.14, D1–D3, D18). The list SQL, the filters, the response shape, `count(*) OVER ()`, offset pagination and the seed contents in the architecture doc are taken as given; this note only checks how the pieces behave. Six findings shape the design. (1) Drizzle expands a JS array interpolated into a `sql` template into `($1, $2, …)`, so `= ANY(${arr})` fails in Postgres and `IN ${[]}` is a syntax error; `sql.param(arr)` binds the whole array as one parameter, which `pg` sends as an array literal. (2) Drizzle's node-postgres driver already returns `date`, `timestamp`, `timestamptz` and `interval` as raw strings, for `db.execute` too; `pg-types` returns `numeric` and `int8` (so `count(*)`) as strings. The "date becomes local midnight" pitfall exists only on the raw `pg` client (the seed). (3) `count(*) OVER ()` gives no total when `offset >= total` (zero rows), and it forces the `LATERAL` latest-action lookup for every matching row instead of only the page. At 2,000 rows that costs 0.3 ms; at 17,000 it costs about 150 ms. (4) Express 5's default "simple" query parser gives a string for `status=A,B` and an array for `status=A&status=B`. `z.coerce.boolean()` turns `"false"` into `true`; `z.stringbool()` does not. (5) `@nestjs/swagger` 12 splits a whole-object `@Query({ schema })` into one OpenAPI parameter per property, using zod's **input** JSON Schema. (6) One `INSERT … SELECT … generate_series` per dealership, with deterministic ids and `ON CONFLICT DO NOTHING`, seeds 3 × 20,000 vehicles in about 1.9 s and is idempotent. Inserting one row at a time is roughly 10× slower.

Method: claims were checked against the installed packages in `apps/api/node_modules` (`drizzle-orm@0.45.4`, `pg@8.23.1` with `pg-types@2.2.0` and `postgres-date@1.0.7`, `zod@4.6.7`, `@nestjs/common` and `@nestjs/platform-express@12.3.2` with `express@5.3.0`, `@nestjs/swagger@12.0.5`), the PostgreSQL 17 docs, and throwaway probes kept outside the repo (scratchpad) under Node 24.15.0 against a separate `postgres:17.11-alpine` container that had the committed migrations and `db/seed.ts` applied. Line numbers refer to the installed package files of the version named. Timings are from one macOS laptop with Postgres in Docker. Read them as orders of magnitude.

## 1. Drizzle `sql` template: arrays, `ANY`, dynamic `WHERE`

- **How a value is bound.** `sql` stores each interpolated value as a query chunk (`drizzle-orm/sql/sql.js:283-292`). When the query is built, a plain value becomes one `$n` parameter (`sql.js:180-183`, the fall-through), and a **JS array becomes a parenthesised list with one parameter per element** (`sql.js:93-102`). The probe printed:

  | Template                                    | SQL                          | Params                      | Result in Postgres                                      |
  | ------------------------------------------- | ---------------------------- | --------------------------- | ------------------------------------------------------- |
  | `v.status = ANY(${arr})`                    | `v.status = ANY(($1, $2))`   | `['IN_STOCK','RESERVED']`   | error `op ANY/ALL (array) requires array on right side` |
  | `v.status IN ${arr}`                        | `v.status IN ($1, $2)`       | `['IN_STOCK','RESERVED']`   | works                                                   |
  | `v.status IN ${[]}`                         | `v.status IN ()`             | `[]`                        | `syntax error at or near ")"`                           |
  | `v.status = ANY(${sql.param(arr)}::text[])` | `v.status = ANY($1::text[])` | `[['IN_STOCK','RESERVED']]` | works; an empty array gives `false`, not an error       |

- **One array parameter.** `sql.param(value)` wraps the value in a single `Param` (`sql.js:325-327`), which renders as one `$n` (`sql.js:137-151`). `pg` serialises a JS array parameter to a Postgres array literal, `{"IN_STOCK","RESERVED"}` (`pg/lib/utils.js:23-45`, `prepareValue` at `73-74`). So the architecture doc's `v.status = ANY($statuses)` is written as `v.status = ANY(${sql.param(statuses)}::text[])`. The `::text[]` cast is not needed when the column type is known, but it makes the parameter type explicit for the planner and for the reader.
- **Query-builder alternative.** `inArray(column, values)` returns `sql\`false\``for an empty array and`column in ($1, …)` otherwise (`sql/expressions/conditions.js:73-81`). It needs a Drizzle column object. The list query is a raw `sql`statement with`LEFT JOIN LATERAL`, so `sql.param` is the one that fits.
- **Composing `WHERE`.** `and(...conditions)` drops `undefined` entries, returns `undefined` when none remain, returns the single condition unwrapped, and otherwise joins with `and` inside parentheses (`conditions.js:26-41`). An `undefined` chunk renders as an empty string (`sql.js:90-91`), so `WHERE ${and(undefined)}` becomes `WHERE ` (a syntax error, probe). The list query always has `v.dealership_id = ${d}`, so `and()` is never empty. `sql.join(chunks, sql\` AND \`)` (`sql.js:306-315`) does **not** filter `undefined`; filter first. Both forms produce the same parameters (probe: `WHERE (v.dealership_id = $1 and lower(v.make) = lower($2))`).
- **Sort direction.** An interpolated string is always a bind parameter (`sql.js:180-183`), never SQL text. `ORDER BY v.stocked_on ${'DESC'}` becomes `ORDER BY v.stocked_on $3`, which Postgres rejects. Choose between two fragments instead, e.g. `sort === 'newest' ? sql\`v.stocked_on DESC, v.id DESC\` : sql\`v.stocked_on, v.id\``. `sql.raw` would also work, but it gives up the guarantee that user input never becomes SQL text.
- **Reusing the `WHERE`.** The filter is an `SQL` object and can be interpolated into a second statement (section 3's count). The `hasAction` condition refers to `la`, so any statement that reuses the fragment needs the same `LEFT JOIN LATERAL … la`.

## 2. Result types from `pg` and Drizzle

- **Drizzle overrides some parsers.** `NodePgPreparedQuery` passes a per-query `types.getTypeParser` that returns the raw text for `TIMESTAMPTZ` (1184), `TIMESTAMP` (1114), `DATE` (1082), `INTERVAL` (1186) and the arrays 1115, 1182, 1185, 1187, 1231. Everything else falls through to `pg`'s defaults (`drizzle-orm/node-postgres/session.js:21-56`, `rawQueryConfig`). `db.execute(sql…)` goes through the same prepared query (`pg-core/session.js:108-116`). So through `db.execute` a `date` is already `'2026-03-29'`, not a `Date`.
- **`pg-types@2.2.0` defaults** (`lib/textParsers.js:167-210`):

  | Type                          | OID   | Default parser                                            | Through `db.execute` (probe)                        |
  | ----------------------------- | ----- | --------------------------------------------------------- | --------------------------------------------------- |
  | `int2` / `int4`               | 21/23 | `parseInteger` → number                                   | `3`                                                 |
  | `int8` (`count(*)`, `bigint`) | 20    | `parseBigInteger` → **string** (`textParsers.js:113-116`) | `'3'`                                               |
  | `numeric`                     | 1700  | none registered → **string**                              | `'12345.50'`                                        |
  | `date`                        | 1082  | `postgres-date` → `Date`                                  | `'2026-03-29'` (Drizzle override)                   |
  | `timestamptz`                 | 1184  | `postgres-date` → `Date`                                  | `'2026-11-02 05:37:18.11179+00'` (Drizzle override) |
  | `date - date`                 | int4  | number                                                    | `87`                                                |

- **The local-midnight pitfall.** For a date-only string, `postgres-date@1.0.7` does `new Date(year, month, day)` (`index.js:75`), which is midnight in the **Node process's** time zone. On the raw client (`pool.query`, `db.$client.query`, the seed's `pg.Client`), the probe in `Asia/Saigon` turned `'2026-03-29'` into `2026-03-28T17:00:00.000Z`, so `toISOString().slice(0, 10)` gives the previous day. The app's Drizzle path never sees this. The seed and its integration test use the raw client, so they should select `stocked_on::text`.
- **What the repo does.** `DealershipGuard` selects `(… AT TIME ZONE d.timezone)::date)::text AS today_local` and types it as `string` (`apps/api/src/modules/auth/dealership.guard.ts:23-29, 53`). Under Drizzle the `::text` is redundant but harmless, and it keeps the value a string if the query ever moves to the raw client. `db.ts` sets no type parsers (`apps/api/src/shared/db.ts:10-24`), so a global `pg.types.setTypeParser` would be a new convention, and the Drizzle override would beat it for `date` and `timestamptz` anyway.
- **The `timestamptz` text format.** The raw string is Postgres's output format, which follows the session's `DateStyle` and `TimeZone` (the probe showed `ISO, MDY` and `UTC`): `2026-11-02 05:37:18.11179+00`, with a space and no `T`. It is not RFC 3339. V8 parsed it (`new Date(s).toISOString()` → `2026-11-02T05:37:18.111Z`, probe), but the ECMAScript spec only requires `Date.parse` to accept its own ISO subset; other formats are implementation-defined ([ECMA-262 Date.parse](https://tc39.es/ecma262/#sec-date.parse)). For `currentAction.createdAt` in a JSON response, either let Postgres format it (`to_char(la.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`, probe `2026-11-02T05:37:34.181Z`), or use `new Date(s).toISOString()` and accept the V8 reliance. Both are formatting, not time-zone maths.
- **Per list column.** `stocked_on` is a string already (or add `::text` for symmetry with the guard). `days_in_stock` is `date − date`, which is `integer`, so it is a number. `count(*) OVER ()` is `bigint`, so cast it `::int`. `list_price numeric(12,2)` is a string; whether the API sends `"12345.50"` or `12345.5` is Q3. `model_year smallint` and `mileage integer` are numbers.

## 3. `count(*) OVER ()` with `LIMIT`/`OFFSET`

- **Evaluation order.** Window functions "logically execute after the processing of" `WHERE`, `GROUP BY` and `HAVING`, and "after non-window aggregate functions" ([tutorial-window](https://www.postgresql.org/docs/17/tutorial-window.html)). They are part of the select list (step 5 of [SELECT, Description](https://www.postgresql.org/docs/17/sql-select.html#SQL-SELECT-DESCRIPTION)). `LIMIT`/`OFFSET` is step 9, after `ORDER BY`: "_start_ rows are skipped before starting to count the _count_ rows to be returned" (same page, LIMIT clause). So `total` is the count of all filtered rows, repeated on each returned row, and it reaches the client only if at least one row survives `OFFSET`.
- **Past the end.** Probe on `generate_series(1,4)` with `LIMIT 2`: `OFFSET 0` → 2 rows with `total = 4`; `OFFSET 3` → 1 row with `total = 4`; `OFFSET 5` → **0 rows**, so there is no total. On 20,000 seeded vehicles, `OFFSET 1000000` also returned `(0 rows)`. A client that pages past the end (or one whose last row was just sold) gets `{items: [], total: ?}`. Returning `total: 0` there would be wrong.
- **Cost.** The window needs every filtered row before the sort and limit, so the `LATERAL` latest-action subquery runs once per matching row, not once per page row. `EXPLAIN ANALYZE` (London, `status = IN_STOCK`, `LIMIT 50`):

  | Rows matching | With `count(*) OVER ()`                                          | Page alone                   | `SELECT count(*)` alone | `count(*)` with `NOT EXISTS` (hasAction=false) |
  | ------------- | ---------------------------------------------------------------- | ---------------------------- | ----------------------- | ---------------------------------------------- |
  | 1,998         | 1.9 ms (`WindowAgg rows=1998`)                                   | 1.6 ms                       | 0.3 ms                  | —                                              |
  | 17,009        | 171 ms (`WindowAgg rows=17009`, lateral `loops=17009`, seq scan) | 21.7 ms (lateral `loops=50`) | 1.3 ms                  | 2.8 ms (hash anti join)                        |

  At the stated ≤ 2,000 rows the difference is negligible. At the README's 20k `EXPLAIN ANALYZE` it is visible but still within the 300 ms p95 target (`backend-architecture.md:83`).

- **Options for the empty page** (Q1):
  - A. Keep `count(*) OVER ()` as decided; when the page is empty and `offset > 0`, run `SELECT count(*)::int FROM vehicle v LEFT JOIN LATERAL (…) la ON true WHERE ${where}` with the same `WHERE` fragment. One extra round trip only on an empty page past the end.
  - B. Always two statements: the page (no window) and the count. The count can use `EXISTS` instead of the lateral join. Two round trips per request, and the faster plan at 20k. Under READ COMMITTED the two statements can see different snapshots, so `total` may be off by a concurrent write unless both run in one `REPEATABLE READ, READ ONLY` transaction (as the dashboard does).
  - C. One statement: `WITH f AS (… WHERE …) SELECT (SELECT count(*) FROM f)::int AS total, … FROM f ORDER BY … LIMIT … OFFSET …` with a `RIGHT JOIN` or a `json_agg` to keep a row when the page is empty. One round trip and always a total, but the SQL is harder to read, and the CTE is still computed in full.

## 4. Query validation and OpenAPI in this repo

- **Repo pattern.** ADR 0005: zod 4 schemas through Nest 12's `StandardSchemaValidationPipe`, registered as `APP_PIPE` with an `exceptionFactory` that throws `ValidationFailedException(toValidationErrors(issues))` (`apps/api/src/shared/shared.module.ts:33-40`). A route opts in with a `schema` option on the parameter decorator; login is the one example (`auth.controller.ts:24-27, 66`). `@Query(options)`, `@Query(property, options)` and `@Param(property, { schema })` all accept `schema` (`@nestjs/common/decorators/http/route-params.decorator.d.ts:271, 289, 520`).
- **The pipe returns the parsed value.** `transform` validates with `schema['~standard'].validate` and, because `transform` defaults to `true`, returns `result.value` (`@nestjs/common/pipes/standard-schema-validation.pipe.js:26, 59-70`). So coerced numbers, defaults and transforms reach the handler. Unknown keys: `z.strictObject` sets `catchall: never()` (`zod/v4/classic/schemas.js:909-916`); the issue is `unrecognized_keys` on the parent object, and `toValidationErrors` emits one `{pointer: "/foo"}` per key (`apps/api/src/shared/problem.ts:62-74`). Probe: `?foo=1` → `unrecognized_keys`, `keys: ["foo"]`.
- **Guards run before pipes** ([Nest request lifecycle](https://docs.nestjs.com/faq/request-lifecycle)). A non-member therefore gets 404 from `DealershipGuard` before the query is validated, and a bad query from a member gets 400. That matches §4.7's status list.
- **What the query parser delivers.** Express 5.3.0 sets `query parser` to `'simple'` (`express/lib/application.js:97`), which is `node:querystring.parse` (`lib/utils.js:162-173`). `req.query` is a getter that re-parses on each access (`lib/request.js:231-240`). `@nestjs/platform-express@12.3.2` does not change the setting (its adapter only configures body-parser `urlencoded` with `extended: true`, `express-adapter.js:351`). `querystring.parse` returns a null-prototype object with a string per key, an **array of strings when a key repeats**, and no nesting. Probe:

  | Query string                        | `req.query`                                  |
  | ----------------------------------- | -------------------------------------------- |
  | `status=IN_STOCK,RESERVED&limit=10` | `{status: 'IN_STOCK,RESERVED', limit: '10'}` |
  | `status=IN_STOCK&status=SOLD`       | `{status: ['IN_STOCK','SOLD']}`              |
  | `limit=`                            | `{limit: ''}`                                |

  zod accepts the null-prototype object (probe), and the pipe's `stripProtoKeys` runs first.

- **Multi-value `status`** (Q2). A comma list is `z.string().transform(s => s.split(',')).pipe(z.array(z.enum([...])).min(1))`. Probe: `IN_STOCK,RESERVED` → `['IN_STOCK','RESERVED']`; `BOGUS` → pointer `/status/0`; `status=` → `['']` → `invalid_value` at `/status/0`; a repeated key → `invalid_type` "expected string, received array" at `/status`. Accepting both forms is `z.union([z.string(), z.array(z.string())]).transform(v => Array.isArray(v) ? v : v.split(','))…` (probe works). In OpenAPI 3.0, the comma form of an array is `style: form, explode: false`; the repeated form is the default `explode: true`.
- **Booleans.** `z.coerce.boolean()` runs `Boolean(value)` (`zod/v4/core/schemas.js:670-674`): `'false'` → `true`, `'0'` → `true`, `''` → `false` (probe). `z.stringbool()` (`zod/v4/core/api.js:1036-1060`) accepts `true/1/yes/on/y/enabled` and `false/0/no/off/n/disabled`, case-insensitively by default, and rejects anything else with a listed-options message (probe: `maybe` → error, `TRUE` → `true`). `z.stringbool({ truthy: ['true'], falsy: ['false'] })` narrows it (probe: `'1'` rejected). `z.enum(['true','false']).transform(v => v === 'true')` is the same thing written out.
- **Numbers.** `z.coerce.number()` runs `Number(value)` (`core/schemas.js:636-640`), which is permissive. Probe: `''` → `0`, `' 5 '` → `5`, `'1e2'` → `100` (passes `.int()`), `'0x10'` → `16`, `['5']` → `5`, `['5','6']` → error. `limit=` therefore fails `min(1)`, but `offset=` silently becomes `0`. The strict form is `z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(…))`.
- **How it shows up in OpenAPI.** `ParameterMetadataAccessor` stores each route argument's `schema` as `standardSchema` (`@nestjs/swagger/dist/services/parameter-metadata-accessor.js:13-18`). For a query argument with **no property name** and an object schema, `createSchemaOverrideParam` emits **one `in: query` parameter per property**, marks the ones in the schema's `required` as required, and promotes a property's `description` to the parameter (`services/schema-object-factory.js:691-726`). The schema comes from `schema['~standard'].jsonSchema.input({ target: 'openapi-3.0' })` (`services/standard-schema-openapi.converter.js:35-39`, `schema-object-factory.js:742-744`), i.e. zod's **input** side. The probe's input JSON Schema for a sample query object:
  - `limit: z.coerce.number().int().min(1).max(100).default(25)` → `{type: integer, minimum: 1, maximum: 100, default: 25}`, not required.
  - `sort: z.enum(['oldest','newest']).default('oldest')` → `{type: string, enum: [...], default: 'oldest'}`.
  - `hasAction: z.stringbool()` → `{type: string}`, with no enum and nothing to say it is a boolean.
  - `status` (string → split → enum array) → `{type: string}`. The allowed values are lost.
  - `additionalProperties: false` is dropped, because an OpenAPI parameter list has no equivalent.

  `.describe('…')` (or `.meta({ description })`) on a property becomes the parameter's description. For `status` and `hasAction`, the allowed values belong in that description, or in the input schema itself (e.g. `z.enum(['true','false'])` before the transform shows as an enum). The path parameter `{d}` is matched by the guard, not by a schema, so it appears only if the route declares it (`@ApiParam` or a `@Param('dealershipId', { schema })`).

- **The `{v}` path parameter.** `DealershipGuard` returns 404 for a malformed `dealershipId` (`dealership.guard.ts:21, 48`). For `vehicleId`, nothing does yet: a non-UUID reaches `WHERE v.id = $1` and Postgres raises `22P02 invalid input syntax for type uuid`, which the filter turns into a 500. Validating it with `z.uuid()` gives a 400 and is stricter than the guard's regex: zod's `uuid` requires the version digit `[1-8]` and the variant `[89ab]` (`zod/v4/core/regexes.js:25-29`); `z.guid()` is the loose form (`regexes.js:21`). Probe: the seed's `00000000-0000-4000-8000-0000000000d1` passes both, and an md5-shaped id (`d41d8cd9-8f00-b204-…`) fails `z.uuid()`. §4.7 lists only 200 and 404 for the detail route. That is Q4.

## 5. Seeding vehicles in Postgres

- **Constraints that bite** (`apps/api/src/shared/schema.ts:79-139, 142-187`): `updated_by` and `vehicle_action.created_by` are `NOT NULL` references to `app_user` (use the seeded admin id). `vehicle_vin_chk` requires `^[A-HJ-NPR-Z0-9]{17}$`. `vehicle_sold_at_chk` requires `sold_at` to be set exactly when `status = 'SOLD'`. `vehicle_dealership_vin_open_uq` is unique on `(dealership_id, vin) WHERE status <> 'SOLD'`. `vehicle_action.id` is `GENERATED ALWAYS AS IDENTITY`, so it cannot take a fixed id without `OVERRIDING SYSTEM VALUE`.
- **Repo pattern.** `db/seed.ts` uses `pg.Client` and plain SQL, imports packages only (ADR 0009), and makes every insert `ON CONFLICT DO NOTHING` with fixed UUIDs `00000000-0000-4000-8000-0000000000dN` (`db/seed.ts:25-41, 67-90`). `seed.spec.ts` runs it twice and asserts the counts do not change (`apps/api/test/integration/seed.spec.ts:34-63`).
- **One statement per dealership** (probe, worked as written):

  ```sql
  WITH d AS (
    SELECT id, timezone, watch_days, aging_days,
           (now() AT TIME ZONE timezone)::date AS today, right(id::text, 1) AS dch
    FROM dealership WHERE id = $1
  ), g AS (
    SELECT d.*, n,
           CASE n WHEN 1 THEN watch_days - 1 WHEN 2 THEN watch_days
                  WHEN 3 THEN aging_days     WHEN 4 THEN aging_days + 1
                  ELSE (n * 37) % 201 END AS age,                       -- 0..200
           CASE WHEN n % 20 = 0 THEN 'SOLD' WHEN n % 10 = 5 THEN 'RESERVED' ELSE 'IN_STOCK' END AS st
    FROM d, generate_series(1, $2::int) AS n
  ), ins AS (
    INSERT INTO vehicle (id, dealership_id, vin, make, model, model_year, mileage, list_price,
                         status, stocked_on, sold_at, updated_by)
    SELECT format('0000000%s-0000-4000-8000-%s', dch, lpad(to_hex(n), 12, '0'))::uuid, id,
           'SEED' || dch || lpad(n::text, 12, '0'),                       -- 17 chars, valid VIN alphabet
           (ARRAY['Toyota','Ford','BMW','Kia','Tesla'])[1 + n % 5], …,
           CASE WHEN age < 2 AND st = 'SOLD' THEN 'IN_STOCK' ELSE st END,
           today - age,
           CASE WHEN st = 'SOLD' AND age >= 2
                THEN ((today - age / 2)::timestamp + time '12:00') AT TIME ZONE timezone END,
           $3                                                             -- admin user id
    FROM g
    ON CONFLICT DO NOTHING
    RETURNING id, dealership_id, vin, stocked_on, status
  )
  INSERT INTO vehicle_action (vehicle_id, dealership_id, action_type, note, created_by, created_at)
  SELECT … FROM ins, d
  WHERE ins.status = 'IN_STOCK' AND ins.stocked_on < d.today - d.aging_days
    AND right(ins.vin, 12)::int % 5 < 2;                                  -- ~40% of aging vehicles
  ```

  - **Time zones stay in Postgres.** `today` is `(now() AT TIME ZONE timezone)::date`, the same expression the guard uses with `$now`, and `sold_at` is built from a local noon with `AT TIME ZONE`. Node passes only the dealership id, `N` and the admin id. Probe: the boundary rows came out at ages 59/60/90/91 (London, Sydney) and 44/45/75/76 (New York), and every `SOLD` row has `sold_at <= now()` and a local sold date at least 5 days after `stocked_on`.
  - **Idempotent.** Deterministic ids make a re-run hit the primary key, and `ON CONFLICT DO NOTHING` with no conflict target also swallows the partial VIN index. Actions are inserted only for rows in `RETURNING`, which is "the output of the RETURNING clause, _not_ the target table" ([WITH, data-modifying statements](https://www.postgresql.org/docs/17/queries-with.html#QUERIES-WITH-MODIFYING)), so a re-run adds no actions. Probe: second run 0 new vehicles, 0 new actions, same counts. A re-run with a larger `SEED_VEHICLES_PER_DEALERSHIP` adds only the missing `n`, with ages computed from that day.
  - **"Latest is current."** Statements inside one `WITH` "are executed concurrently … the order in which the specified updates actually happen is unpredictable" (same page), and `ORDER BY` in an `INSERT … SELECT` is not documented to fix identity order. So the second, newer action for some vehicles goes in a **separate statement** after the first, e.g. `INSERT … SELECT … FROM vehicle v WHERE … AND (SELECT count(*) FROM vehicle_action a WHERE a.vehicle_id = v.id) = 1`. Separate statements guarantee that the later one gets the higher ids, and the `= 1` guard keeps it idempotent. Give the earlier action an older `created_at` so id order and time order agree.
  - **Re-acquired VIN.** A second row with a fixed id, the same VIN as a `SOLD` row (e.g. `n = 20`, `SEED1000000000020`) and `status = 'IN_STOCK'` inserts once and is skipped on re-run (probe: `rowCount` 1, then 0; one `SOLD` row and one `IN_STOCK` row with that VIN). With a random id instead, the partial unique index would still make the re-run a no-op, but only while the open row exists.
  - **VINs.** `'SEED' || <dealership digit> || lpad(n, 12, '0')` uses only allowed characters (`S`, `E`, `D`, digits), passes `vehicle_vin_chk`, and is unique across dealerships, which makes tenant-isolation tests easy to read. It has no real check digit; D18 asks only for format and uniqueness (`backend-architecture.md:113`). Random VINs from the 33-character alphabet in SQL (`substr(alphabet, 1 + floor(random()*33)::int, 1)` × 17) would need retry logic for collisions and are not reproducible.
  - **Ids.** `format('0000000%s-0000-4000-8000-%s', dch, lpad(to_hex(n), 12, '0'))` is a valid v4-shaped UUID, so it passes `z.uuid()` as well as the guard regex. An `md5(...)::uuid` id would not pass `z.uuid()` (section 4).

- **Throughput.** Set-based, three dealerships: N = 250 → 40 ms (re-run 7 ms); N = 2,350 → 181 ms; N = 20,000 → 1.9 s including about 3,800 actions (re-run 0.36 s). One-row `INSERT`s from Node over loopback: 2,000 rows → 0.67 s with autocommit and 0.71 s inside one transaction, into a temp table **without** the indexes. That is about 7 s per 20,000 rows, or 21 s for three dealerships, before index maintenance. The round trip per row dominates, so the set-based statement is about 10× faster.
- **Boundary drift.** Ages are fixed relative to the day the seed ran. A vehicle seeded at exactly `watch` days is at `watch + 1` the next day. The seed boundaries are for demos; integration tests for tiers must insert their own rows relative to a pinned `Clock` (the architecture doc's D3 test is already a unit test on `tierOf`).
- **Atomicity.** The current seed runs statements without a transaction (`seed.ts:60-92`). With deterministic ids, a failed run can be re-run safely. Wrapping it in `BEGIN … COMMIT` would make a failure leave nothing behind, but it is not needed for idempotency.

## Questions

**Q1. Total when the page is empty.** A (window plus fallback count), B (always two statements), C (one CTE statement); see section 3. Recommendation: A. It keeps the decided query, costs nothing on normal pages, and fixes the only case where the window gives no total.

**Q2. Multi-value `status`.** A. Comma-separated only (`status=IN_STOCK,RESERVED`), with a repeated key → 400. B. Accept both forms. Recommendation: A. It is one documented form (§4.7 lists `status` once), the repeated form fails loudly rather than silently, and the description can say "comma-separated".

**Q3. `listPrice` in JSON.** A. A string as Postgres returns it (`"12345.50"`), exact. B. A number (`Number(row.list_price)`), simpler for clients; `numeric(12,2)` values up to 10^10 with two decimals are below 2^53 and round-trip through `toFixed(2)`. Recommendation: B, unless the frontend will do money arithmetic. The create endpoint takes a number, so the read should match.

**Q4. A malformed `{v}`.** A. Same regex as the guard; a non-UUID returns 404. B. `@Param('vehicleId', { schema: z.uuid() })`; a non-UUID returns 400 `VALIDATION_FAILED`. Recommendation: A. §4.7 lists 200 and 404 for the detail route, a malformed id is "no such vehicle", and it matches how `{d}` is handled. Either way it must not reach Postgres as a 500.

## Recommendations

1. Bind status lists as one parameter: `v.status = ANY(${sql.param(statuses)}::text[])`; never interpolate a raw array into `ANY(...)`.
2. Build the `WHERE` with `and(...)` from `drizzle-orm` and optional `undefined` fragments; always include `v.dealership_id`.
3. Choose the sort with two `sql` fragments, not an interpolated `'ASC'`/`'DESC'` string.
4. Cast `count(*) OVER ()` to `::int` and keep `stocked_on` as text; through Drizzle, `date` and `timestamptz` are already strings and need no type parser.
5. Format `currentAction.createdAt` as RFC 3339 (in SQL with `to_char(… AT TIME ZONE 'UTC', …)` or with `new Date(s).toISOString()`); do not send Postgres's raw text.
6. Keep `count(*) OVER ()` and run a fallback `count(*)` with the same `WHERE` when the page is empty and `offset > 0` (Q1 A).
7. Validate the query with one `@Query({ schema: z.strictObject({...}) })` so swagger lists each parameter and unknown keys get 400.
8. Use `z.stringbool({ truthy: ['true'], falsy: ['false'] })` (or an enum transform) for `hasAction`, never `z.coerce.boolean()`.
9. Parse `status` as a comma-separated string piped into `z.array(z.enum(...)).min(1)`, and put the allowed values in `.describe()` (Q2 A).
10. Use `z.coerce.number().int()` with `min`/`max`/`default` for `limit` and `offset`, or a `^\d+$` regex if `offset=` should be a 400.
11. Reject a malformed `{v}` with 404 before it reaches Postgres (Q4 A).
12. Seed vehicles with one `INSERT … SELECT generate_series` per dealership, with deterministic v4-shaped ids, `ON CONFLICT DO NOTHING`, and actions only for the `RETURNING` rows.
13. Compute `stocked_on` and `sold_at` in SQL from `(now() AT TIME ZONE d.timezone)::date`, with boundary rows at `n = 1..4`, and generate VINs as `'SEED' || dealership digit || lpad(n, 12, '0')`.
14. Insert the newer of two actions in a separate statement so that id order matches time order.
15. Read seed rows in tests with `::text` casts, because the raw `pg` client turns `date` into local-midnight `Date`s.
