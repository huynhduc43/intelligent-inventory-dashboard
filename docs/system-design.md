# System Design: Intelligent Inventory Dashboard (backend)

System Design Document for the Keyloop technical assessment, Scenario B, backend layer. It condenses the design in [`research/backend-architecture.md`](research/backend-architecture.md) (the "architecture doc") for a reviewer. Decision numbers (D1–D19, P1–P3) and section references (§) point back to it; it holds the reasoning and sources this page leaves out. Decisions made since are ADRs in [`adr/`](adr/README.md). Each PR updates this page when it changes what the page describes. The figures here show the whole system; the diagrams drawn for each feature's spec stay with it in [`diagrams/specs/issue-<N>/`](diagrams/specs/).

Status: the MVP is complete. The repo has the skeleton (validated config, the Drizzle schema and migration, the injected `Clock`, readiness with a Postgres ping, Docker Compose), `AgingPolicy` with its unit tests, auth, the OpenAPI document, the vehicle list, detail, intake and status-change endpoints (`GET` and `POST …/vehicles`, `GET …/vehicles/{vehicleId}`, `PATCH …/vehicles/{vehicleId}/status`), the dashboard read (`GET …/dashboard`), the vehicle actions endpoints (`POST` and `GET …/vehicles/{vehicleId}/actions`), and the dealership settings endpoints (`GET` and `PATCH …/settings`); deliberately deferred items are listed in §6 of the architecture doc.

---

## 1. Problem and scope

Dealership managers need a live view of their vehicle stock:

1. **Inventory list**, filterable by make, model, age, tier and status (D7).
2. **Aging stock**: vehicles in stock longer than the dealership's aging threshold (default 90 days) are flagged on every read and summed up on the dashboard (D3, D10).
3. **Actions**: a manager logs a proposed action per vehicle (e.g. `PRICE_REDUCTION_PLANNED`), kept as an append-only history (D4).

The backend is a REST API on PostgreSQL. The client is stubbed with Swagger UI (OpenAPI at `/docs`), `docs/api/curl-examples.sh` and Supertest.

**Sizing (§1.3):** 50 dealerships, ≤ 2,000 in-stock vehicles each, dashboards polled every 10 s (D9), about 25 requests/s at peak, about 50 writes per dealership per day. One API instance and one Postgres have plenty of headroom, so the MVP adds no cache, queue or second service.

**Targets (§1.4):** dashboard and list p95 ≤ 300 ms at 2,000 in-stock vehicles; a status change can't race into an illegal state; any `5xx` can be traced from its error body to its log line in under a minute.

---

## 2. Architecture

A **modular monolith**: one stateless NestJS process (`apps/api`), one PostgreSQL database, five tables.

![Architecture: a client stub calls the stateless NestJS API, where the auth guards gate four dealership-scoped modules; each module writes its own Postgres table; dashboard, inventory (latest action) and actions (vehicle status) read across them.](diagrams/architecture.svg)

_Figure 1. Containers and modules. The auth guards gate every dealership route; each module writes only its own table; the only cross-table reads are `dashboard`, `inventory`'s latest-action lookup ([ADR 0011](adr/0011-inventory-reads-latest-action.md)) and `actions`' vehicle-status check ([ADR 0013](adr/0013-actions-read-vehicle-status-in-the-insert.md))._

### 2.1 Component roles

Each box in Figure 1, in one or two sentences:

- **Client stub:** stands in for the dashboard front end, which is out of scope (backend only). Swagger UI at `/docs`, `curl-examples.sh` and the Supertest suites call the API the way the UI would. The committed `docs/api/openapi.json` is generated from the code (`pnpm --filter @inventory/api openapi:export`) and drift-tested ([ADR 0010](adr/0010-openapi-from-code-and-committed-export.md)); request and 2xx response bodies are `$ref`s to named components, also tested ([ADR 0016](adr/0016-openapi-schemas-are-named-components.md)).
- **`auth`:** decides who may do what. It logs users in (`POST /auth/login`, argon2id, per-IP throttle, D13) and provides the two guards: `JwtAuthGuard` (401) and `DealershipGuard`, which checks membership (404) and permission (403) and loads the dealership's time zone and thresholds (D15, D16). Writes `app_user` and `user_dealership`.
- **`dealerships`:** holds each dealership's settings, its time zone and its watch/aging thresholds (D3). Writes `dealership`.
- **`inventory`:** the vehicles themselves. It adds vehicles, lists and filters them by make, model, age, tier and status (D7), and moves them through `IN_STOCK ⇄ RESERVED → SOLD` (D6). The pure aging rules (`AgingPolicy`) live in its `domain/`. Writes `vehicle`.
- **`actions`:** records what a manager plans to do about a vehicle (e.g. `PRICE_REDUCTION_PLANNED`). Append-only: the newest action is the current one (D4, P3). Writes `vehicle_action`.
- **`dashboard`:** the read side for the manager's overview. It computes the KPIs, age buckets and "aging with no action" count in one query (D10–D12). It reads across tables and writes nothing.
- **`health`:** tells the platform whether to restart the process (`/health/live`) or route traffic to it (`/health/ready`, pings Postgres). Public, outside the guards.
- **`shared`:** the plumbing every module uses: validated config, the Drizzle connection, the injected `Clock`, the problem+json exception filter and the pino logger.
- **PostgreSQL:** the single source of truth. It also does all time-zone maths (P1) and enforces the state rules through constraints and conditional writes (P2).

Module rules (§4.2): only the owning module writes a table, cross-table reads are read-only SQL and only where named: `dashboard`, `inventory` list/detail reading the latest `vehicle_action` ([ADR 0011](adr/0011-inventory-reads-latest-action.md)), and `actions` reading `vehicle.status` inside its insert ([ADR 0013](adr/0013-actions-read-vehicle-status-in-the-insert.md)), no dependency cycles: `dealerships` depends on `auth` and on `AgingPolicy` in `inventory/domain` ([ADR 0014](adr/0014-dealerships-uses-aging-policy-validate-thresholds.md)), `inventory` on `auth` (not on `dealerships`), `actions` on `auth` (it imports nothing from `inventory`), `dashboard` on `auth` and `shared` only (thresholds come from `DealershipGuard`, as in ADR 0014).

### 2.2 Data model

| Table             | Holds                                                                                                       | Key constraints                                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dealership`      | Name, IANA `timezone`, `watch_days` (60), `aging_days` (90)                                                 | `CHECK 1 ≤ watch < aging ≤ 3650`                                                                                                                                                   |
| `app_user`        | Email, display name, argon2id hash, `ACTIVE`/`DISABLED`                                                     | `UNIQUE lower(email)`                                                                                                                                                              |
| `user_dealership` | Membership and role (`ADMIN`, `MANAGER`, `VIEWER`) per dealership (D16)                                     | PK `(user_id, dealership_id)`                                                                                                                                                      |
| `vehicle`         | VIN, make, model, year, mileage, price, `status`, **`stocked_on` (date)**, `sold_at`, `updated_by/at` (D19) | Partial `UNIQUE (dealership_id, vin) WHERE status <> 'SOLD'` (D18); `CHECK (status = 'SOLD') = (sold_at IS NOT NULL)`                                                              |
| `vehicle_action`  | `action_type` (enum, D4), optional note ≤ 1,000 chars, `created_by/at`                                      | Identity `id`; index `(vehicle_id, id DESC)` for "latest action"; composite FK `(vehicle_id, dealership_id)` to `vehicle` ([ADR 0012](adr/0012-composite-fk-on-vehicle-action.md)) |

![Schema: five tables with primary and foreign keys, CHECK constraints and indexes; `dealership` and `app_user` are referenced by `vehicle`, `vehicle_action` and `user_dealership`.](diagrams/schema-er.svg)

Every row carries `dealership_id`, and every query filters on it. There is no stored age or tier column (§3.2).

---

## 3. Data flow

### 3.1 A request, end to end

1. **Edge.** `pino-http`, mounted ahead of the body parser, assigns a request ID (echoed as `X-Request-ID`); `nestjs-pino` binds it to every log line of the request. A zod schema through Nest's `StandardSchemaValidationPipe` (ADR 0005) rejects unknown fields and bad shapes (400); `pino-http` is mounted ahead of the body parser, so even a malformed body gets an ID (ADR 0006).
2. **Guards.** `JwtAuthGuard` verifies the token (HS256 only, `iss`/`aud`/`exp`; RFC 8725) or returns 401. `DealershipGuard` runs the context query below. No row → **404**, so a non-member can't tell whether a dealership exists ([RFC 9110 §15.5.4](https://www.rfc-editor.org/rfc/rfc9110.html#name-403-forbidden)). Row found but the role lacks the route's `@RequirePermission` → **403** (D15, D16). The JWT carries no roles; membership, user status and role are re-read on every request, so revoking access takes effect on the next call.
3. **Controller → service.** The handler receives the context (role, time zone, thresholds, `today_local`). Pure rules in `domain/` (no I/O) turn the request into SQL parameters.
4. **SQL.** One parameterised statement or one short transaction through Drizzle, always scoped by `dealership_id`. A `statement_timeout` (default 5 s) caps every query.
5. **Response.** JSON; inventory reads send `Cache-Control: no-store` so a 10 s poll always gets fresh data (D9).

```sql
-- Context query, run once per request by DealershipGuard. $now comes from the injected Clock.
SELECT m.role, d.timezone, d.watch_days, d.aging_days,
       ($now::timestamptz AT TIME ZONE d.timezone)::date AS today_local
FROM user_dealership m
JOIN app_user u   ON u.id = m.user_id AND u.status = 'ACTIVE'
JOIN dealership d ON d.id = m.dealership_id
WHERE m.user_id = $userId AND m.dealership_id = $dealershipId;   -- 0 rows ⇒ 404
```

### 3.2 Aging: derived in Postgres, never stored (D1–D3, P1)

- `stocked_on` is a `date`. Age is `today_local − stocked_on`, in calendar days in the dealership's time zone, so a tier flips at the dealership's midnight and DST can't shift the count.
- **Time zones are computed only in Postgres** with `AT TIME ZONE` ([docs](https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-ZONECONVERT)). Node never does time-zone maths, so there is a single tzdata source. A dealership time zone must be a zone name from `pg_timezone_names` that is not also an abbreviation (`Etc/UTC`, not `UTC`; [ADR 0015](adr/0015-time-zone-must-be-a-zone-name-not-an-abbreviation.md)).
- **`now` comes from an injected `Clock`** and is passed to SQL as `$now`. Tests pin it (e.g. 23:30 vs 00:30 New York time) to prove the day boundary.
- **`AgingPolicy`** (pure TypeScript) owns `tierOf` (`FRESH` < watch ≤ `WATCH` ≤ aging < `AGING`), `bucketOf` (fixed 0–30, 31–60, 61–90, 90+), `validateThresholds` (1 ≤ watch < aging ≤ 3650) and `toStockedOnBounds`. Tier and age filters become `stocked_on` bounds before they reach SQL, so `?tier=AGING` is an indexed range scan on `(dealership_id, status, stocked_on)`, not a computed-column filter.
- There is no tier flag and no nightly job: a vehicle becomes aging because a day passes, with no write (§6.4 rejects the stored flag).

### 3.3 Dashboard read (D10–D12)

![Sequence: a dashboard poll passes the JWT check and the context query; non-members get 404 and members without the permission 403; otherwise the handler reads KPIs from one Postgres snapshot and returns 200.](diagrams/sequence-dashboard-read.svg)

_Figure 2. Dashboard KPI read. Guard outcomes branch first; the handler then reads all sections from one snapshot._

The handler runs three statements (KPIs and buckets, make/model breakdown, current-action counts) in one `REPEATABLE READ, READ ONLY` transaction, so every section comes from the same snapshot ([isolation](https://www.postgresql.org/docs/current/transaction-iso.html)). It uses aggregate `FILTER` over the dealership's `IN_STOCK` rows only (D12) and a `LATERAL` join for each vehicle's latest action. "Aging with no action" means no action was ever logged; `MONITOR` counts as an action (D11). At ≤ 2,000 rows this is a millisecond query, so there is no cache.

### 3.4 Writes: conditional SQL, no locks (D5, D6, P2, P3)

![Sequence: a status change is one conditional UPDATE; one row returns 200; zero rows trigger a re-read that becomes 404 or 409, returned by the exception filter as problem+json.](diagrams/sequence-status-change.svg)

_Figure 3. Vehicle status change. The database checks the transition atomically; zero rows means "missing" (404) or "wrong state" (409)._

- **Status change:** `UPDATE vehicle SET status = $new … WHERE id = $v AND dealership_id = $d AND status = ANY($allowedFrom) RETURNING id`, then the 200 body comes from a follow-up `VehiclesService.get` read. `$allowedFrom` comes from `allowedFrom(target)` in `inventory/domain/vehicle-lifecycle.ts`: `IN_STOCK ⇄ RESERVED`, either → `SOLD` (terminal, sets `sold_at`). On 0 rows the service re-reads the vehicle: missing → 404, otherwise `409 INVALID_TRANSITION` (same-state transitions included). Two concurrent requests can't both win. `PATCH …/vehicles/{v}/status` answers `200` with the vehicle in the detail shape; `updated_by` and `updated_at` (and `sold_at` for `SOLD`) come from the caller and the injected `Clock`.
- **Logging an action:** `INSERT INTO vehicle_action … SELECT … FROM vehicle WHERE id = $v AND dealership_id = $d AND status = 'IN_STOCK'`. A car sold a millisecond earlier can't receive an action; 0 rows → 404 or `409 VEHICLE_NOT_IN_STOCK`. `POST …/vehicles/{v}/actions` answers `201` with the action and a `Location`; `GET` on the same path returns the whole history newest first (any vehicle status, no paging yet).
- **Creating a vehicle:** `INSERT INTO vehicle … ON CONFLICT (dealership_id, vin) WHERE status <> 'SOLD' DO NOTHING RETURNING id`, arbitrated by the partial unique index. 0 rows means an unsold vehicle already has the VIN: `409 VIN_ALREADY_IN_STOCK`, with no re-read. Concurrent inserts of one VIN give exactly one `201`. A VIN whose earlier vehicle is `SOLD` is re-acquired as a new row, leaving the sold row untouched. `POST …/vehicles` answers `201` with the vehicle and a `Location`.
- **Updating settings:** `validateThresholds` runs first on the merged pair (patch over the guard's stored values), then one `UPDATE dealership SET x = COALESCE($x, x) … WHERE id = $d AND` the ADR 0015 zone check `RETURNING` the row and `todayLocal`. 0 rows → `422 TIMEZONE_INVALID`; a `23514` on `dealership_thresholds_chk` (a racing commit) → `422 THRESHOLDS_INVALID`. `GET`/`PATCH …/settings` need `settings:read` / `settings:update`.
- **Concurrent actions** on the same car both persist; the newest by `id` is current, and nothing is overwritten, so nothing is silently lost (P3).

### 3.5 Error path

Every error leaves through one global exception filter as RFC 9457 `application/problem+json` ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457); [Nest exception filters](https://docs.nestjs.com/exception-filters)) with a stable `code` (`VALIDATION_FAILED`, `INVALID_TRANSITION`, …). The `instance` member is the request ID, which is also on the request's log line (§4.8). A `500` never leaks internals; the stack goes to the log only.

---

## 4. Technology choices

"Status" says what is in `package.json` today versus planned for the build steps in §4.16.

| Technology                                    | Role                               | Why                                                                                                                                                                                                                                                                                                                               | Alternative considered                                                                                                     | Status                                                                            |
| --------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Node.js 24 (≥ 24.7) + TypeScript 6, strict    | Runtime and language               | `crypto.argon2` is built in from Node 24.7 ([Node crypto](https://nodejs.org/api/crypto.html)), so password hashing needs no native addon. Strict TS plus typed SQL catches shape errors at build time.                                                                                                                           | —                                                                                                                          | Installed                                                                         |
| zod                                           | Config validation                  | Parses `process.env` once at startup, before Nest; on failure the API exits non-zero naming every bad variable (§4.13).                                                                                                                                                                                                           | —                                                                                                                          | Installed                                                                         |
| NestJS 12 (ESM)                               | HTTP framework, modules, DI        | Modules give the boundaries above ([modules](https://docs.nestjs.com/modules)); guards carry auth and tenancy ([guards](https://docs.nestjs.com/guards)); zod through `StandardSchemaValidationPipe` (ADR 0005) and OpenAPI from decorators ([docs](https://docs.nestjs.com/openapi/introduction)) give the client stub for free. | Express or Fastify alone: we would hand-build DI, guards and OpenAPI. Fastify stays available as a Nest adapter.           | Installed (core); `@nestjs/jwt`, `@nestjs/throttler`, `@nestjs/swagger` installed |
| PostgreSQL (pinned image tag)                 | System of record                   | Relational data with constraints that enforce rules (partial unique, `CHECK`), `AT TIME ZONE` for local dates, `LATERAL` and aggregate `FILTER` for the dashboard ([FILTER](https://www.postgresql.org/docs/current/sql-expressions.html#SYNTAX-AGGREGATES)).                                                                     | MongoDB: no relational constraints and no date maths in the store.                                                         | Installed (`postgres:17.11-alpine` in Compose)                                    |
| Drizzle ORM + drizzle-kit                     | Data access and SQL migrations     | SQL-first with typed `sql` templates ([docs](https://orm.drizzle.team/docs/sql)), so the `LATERAL`/`FILTER`/`AT TIME ZONE` queries stay typed; transactions with an isolation level ([docs](https://orm.drizzle.team/docs/transactions)); generated SQL migrations ([docs](https://orm.drizzle.team/docs/migrations)).            | Prisma: viable, but these queries would be raw SQL anyway.                                                                 | Installed                                                                         |
| `nestjs-pino`                                 | Structured logging                 | JSON logs with a request ID bound to every line via `AsyncLocalStorage`, without request-scoped providers ([repo](https://github.com/iamolegga/nestjs-pino)); pino path redaction ([docs](https://github.com/pinojs/pino/blob/main/docs/redaction.md)).                                                                           | Nest's built-in logger: no per-request context.                                                                            | Installed                                                                         |
| `@nestjs/terminus`                            | Liveness and readiness             | Standard health endpoints; a failing indicator turns the check into an error response, and shutdown reports `503` ([docs](https://docs.nestjs.com/recipes/terminus)).                                                                                                                                                             | A hand-written `/health` route.                                                                                            | Installed (readiness pings Postgres)                                              |
| RFC 9457 problem+json                         | Error format                       | One machine-readable error shape for every client; `instance` identifies the occurrence ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)).                                                                                                                                                                                     | Ad-hoc `{message}` bodies.                                                                                                 | Installed                                                                         |
| JWT (HS256) + argon2id                        | Authentication                     | Stateless, so replicas need no shared session; algorithm allowlist and `iss`/`aud`/`exp` checks per [RFC 8725](https://www.rfc-editor.org/rfc/rfc8725). argon2id at OWASP's minimum parameters ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)).                                       | Session cookie (simpler for one SPA); bcrypt (truncates at 72 bytes).                                                      | Installed                                                                         |
| Vitest 4 + Supertest                          | Unit and HTTP tests                | Two projects (unit, integration) in one config ([projects](https://vitest.dev/guide/projects)); coverage thresholds per glob enforce 100% on `domain/**` ([coverage config](https://vitest.dev/config/coverage)).                                                                                                                 | Jest: its ESM support is still experimental ([docs](https://jestjs.io/docs/ecmascript-modules)), and this codebase is ESM. | Installed                                                                         |
| Testcontainers (`@testcontainers/postgresql`) | Integration tests on real Postgres | The rules under test are SQL date maths and constraints; only a real Postgres proves them ([docs](https://node.testcontainers.org/modules/postgresql/)).                                                                                                                                                                          | SQLite or mocks: different date and constraint semantics.                                                                  | Installed                                                                         |
| Turborepo + pnpm                              | Monorepo tasks                     | Cached `lint`/`typecheck`/`test` per package ([caching](https://turborepo.dev/docs/crafting-your-repository/caching)); one `pnpm verify` mirrors CI.                                                                                                                                                                              | Plain pnpm scripts: no task cache.                                                                                         | Installed                                                                         |
| Docker Compose                                | Local run                          | One command starts API and Postgres for a reviewer.                                                                                                                                                                                                                                                                               | Manual Postgres install.                                                                                                   | Installed                                                                         |

---

## 5. Observability

| Signal          | MVP                                                                                                                                                                                                                                                                                                                                                            | Deferred (trigger)                                                                                                                                                                                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Logs**        | One JSON line per request: `time, level, msg, req_id, user_id, dealership_id, route, method, status, duration_ms`. `authorization` and `*.password` are redacted. `warn` on failed logins, `error` with stack on `5xx`. No `console` anywhere (lint rule). (§5.1)                                                                                              | Shipping to a log store comes with the first deployment.                                                                                                                                                                                                                                               |
| **Correlation** | The problem+json `instance` equals `req_id`, and `X-Request-ID` is on every response. A user reporting an error hands over the ID, which finds the log line directly (target: under 1 minute, §1.4).                                                                                                                                                           | W3C `traceparent` propagation with tracing (below).                                                                                                                                                                                                                                                    |
| **Health**      | `/health/live`: process up, no dependencies, so a DB outage never restarts the container. `/health/ready`: Postgres ping; `503` when the DB is down or during shutdown. `SIGTERM` drains in-flight requests (`enableShutdownHooks`, [lifecycle](https://docs.nestjs.com/fundamentals/lifecycle-events#application-shutdown)).                                  | —                                                                                                                                                                                                                                                                                                      |
| **Metrics**     | _Filled gap, see note._ No metrics endpoint. Latency and error rate per route are read from the `duration_ms` and `status` fields of the request logs, and p95 is verified once with `EXPLAIN ANALYZE` on a 20,000-per-dealership seed (about 16,000 in stock each) (`pnpm --filter @inventory/api db:explain`, results in the README's Performance evidence). | OpenTelemetry metrics: `http.server.request.duration` per route for RED, business counters `vehicle_action.logged{action_type}` and `auth.login.attempts{result}`, a DB pool gauge; first SLOs 99.9% non-5xx and p95 ≤ 300 ms on dashboard and list. Trigger: first deployment beyond a laptop (§5.2). |
| **Tracing**     | None; the request ID is the correlation key within one process and one database.                                                                                                                                                                                                                                                                               | OpenTelemetry Node SDK with auto-instrumentation for HTTP and `pg` spans, a manual span on the dashboard query, `trace_id` on log lines ([OTel Node](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)). Same trigger; stretch goal if time allows (§4.16).                          |

Note: the architecture doc defines metrics and tracing only for after deployment (§5.2); "per-route latency from log fields" is this document's reading of what the MVP logs already allow, not a separate component.

---

## 6. Assumptions

Where the brief was silent (architecture doc §2, "A" rows):

- Age counts **calendar days in the dealership's time zone** from `stocked_on` (D2).
- Age buckets are **fixed** (0–30, 31–60, 61–90, 90+) and independent of the per-dealership thresholds (D10).
- "Aging with no action" = **no action ever logged**; `MONITOR` counts as one (D11). KPIs count `IN_STOCK` only (D12).
- Actions are allowed on any `IN_STOCK` vehicle; `RESERVED` and `SOLD` get 409 (D5).
- Dealerships and users come from the **seed script**; there is no sign-up or admin API (D17).
- A VIN is unique among **non-sold** vehicles per dealership, so a re-acquired car gets a new row and a fresh age (D18).
- One 1 h access token, **no refresh token** (D13); `created_by`/`updated_by` are the audit trail (D19).

## 7. Deferred, with triggers

The MVP stays small on purpose; each item below has a trigger and a seam that already exists (full list in architecture doc §6).

| Deferred                               | Trigger                                            | Why it's cheap later                                                                       |
| -------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| ETag/304 or SSE push for polling       | Polling reaches hundreds of rps or DB CPU climbs   | The guard already loads `today_local` and thresholds                                       |
| Keyset pagination                      | Tens of thousands of vehicles per dealership       | The index already ends in `stocked_on`                                                     |
| Replicas, shared rate-limit store      | Availability needs or CPU                          | API is stateless except the in-memory login throttler (`shortcut:`)                        |
| Read replica or cache for `dashboard`  | DB saturates                                       | `dashboard` is already a separate read side                                                |
| Refresh tokens, server-side logout     | A real SPA ships / immediate logout required       | Context query already runs per request                                                     |
| `If-Match` on actions                  | Conflicting decisions reported                     | Append-only table; add a sequence column                                                   |
| CSV import, DMS adapter, outbox events | Real dealership data arrives / other systems react | Partial unique `(dealership_id, vin)` is the upsert target; writes are single transactions |
| Custom roles, row-level security       | Dealers ask / many teams write queries             | Guards check permissions, not roles; `dealership_id` on every row                          |
| Metrics and tracing (OpenTelemetry)    | First deployment beyond a laptop                   | Request ID and structured logs already in place                                            |

---

## 8. How GenAI was used in the design phase

The design was produced with an AI agent (Claude Code, Claude Opus) as the researcher and drafter, and me as the decision-maker. The full log, with links to every issue, PR and review comment, is [`ai-collaboration.md`](ai-collaboration.md).

1. **Brief first.** The agent extracted the brief's requirements word for word into the architecture doc (§0), so every later decision traces back to one (§7, traceability table).
2. **Research against primary sources.** The agent researched the unknowns (Postgres time-zone conversion, Drizzle transactions, RFC 9110/9457/8725, OWASP password storage) in the official docs and specs, and every claim links its source inline, so none rests on the model's memory alone.
3. **Ask, then decide.** The agent put each ambiguity to me and recorded the answers as numbered decisions. Each is marked **U** (my decision: 14 of 19) or **A** (the agent's assumption: D2, D11, D17, D18, D19); the assumptions are listed in §6 so a reviewer sees what was assumed rather than asked.
4. **Find the hard problems before the code.** The agent named three correctness problems and how the design prevents each: time-zone-correct tiers (P1), status races (P2) and concurrent actions (P3). Each has a test row in the architecture doc's test plan (§4.15).
5. **Cut to a buildable MVP.** The architecture doc went through four revisions. The last, the agent's own call, cut the scope to what one person can build and explain in the video; the eleven features dropped (refresh tokens, CSV import, ETag polling, audit table and others) moved to §7 here, each with the trigger that would bring it back.
6. **Diagrams checked by eye.** Diagrams are drawn with the `diagram-design` skill rather than Mermaid (my call), and the agent reads each rendered image before publishing to check it shows what it claims.
7. **Design stays the baseline.** The build order became issues #6–#15. During the build, each feature goes through `/deliver` (analyst, architect, contract, implementer, two independent reviewers, tester), and decisions made along the way become ADRs ([`adr/`](adr/README.md)) in the same PR that implements them.
