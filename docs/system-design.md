# System Design: Intelligent Inventory Dashboard (backend)

System Design Document for the Keyloop technical assessment, Scenario B, backend layer. It condenses the design in [`research/backend-architecture.md`](research/backend-architecture.md) (the "architecture doc") for a reviewer. Decision numbers (D1–D19, P1–P3) and section references (§) point back to it; it holds the reasoning and sources this page leaves out. Decisions made since are ADRs in [`adr/`](adr/README.md). Each PR updates this page when it changes what the page describes. The figures here show the whole system; the diagrams drawn for each feature's spec stay with it in [`diagrams/specs/issue-<N>/`](diagrams/specs/).

Status: the MVP is complete. The repo has the skeleton (validated config, the Drizzle schema and migration, the injected `Clock`, readiness with a Postgres ping, Docker Compose), `AgingPolicy` with its unit tests, auth, the OpenAPI document, the vehicle list, detail, intake and status-change endpoints (`GET` and `POST …/vehicles`, `GET …/vehicles/{vehicleId}`, `PATCH …/vehicles/{vehicleId}/status`), the dashboard read (`GET …/dashboard`), the vehicle actions endpoints (`POST` and `GET …/vehicles/{vehicleId}/actions`), and the dealership settings endpoints (`GET` and `PATCH …/settings`); deliberately deferred items are listed in §6 of the architecture doc.

---

## 1. Problem, scope and requirements

### 1.1 Problem and goals

A car that sits on the lot too long loses margin every day. Dealership managers need to see their stock as it is now, spot the cars that have been there too long, and record what they plan to do about each one. The goals:

1. Show each dealership its stock, filterable.
2. Flag aging stock automatically, by the dealership's own calendar, with nobody marking cars by hand.
3. Keep a history of the actions managers plan for each car.
4. Meet the brief's "Build for the Future" qualities (scalability, performance, reliability, maintainability, observability) while staying a small MVP one person can build and explain.

### 1.2 Scope

- **In scope:** a REST API on PostgreSQL (the brief's backend layer), with login and per-dealership access. It covers the inventory list, detail, intake and status changes; aging tiers and the dashboard; vehicle actions; and per-dealership settings (time zone and thresholds). Also in scope: the client stub (OpenAPI at `/docs`, `docs/api/curl-examples.sh`, Supertest), health endpoints, structured logs and Docker Compose.
- **Out of scope:**
  - The front end, which is stubbed.
  - Sign-up and user or dealership administration; the seed script creates them (D17).
  - CSV or DMS import (D8).
  - Editing vehicle fields.
  - Prices or cost figures on the dashboard.
  - Notifications, refresh tokens, and metrics and tracing (designed in §5 but not built).

  §7 gives each of these the trigger that would bring it in.

### 1.3 Functional requirements

| ID   | Requirement                                                                                                                                                                       | Source             | Endpoint                                   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------ |
| FR1  | List a dealership's vehicles, filtered by make, model, age, tier, status and whether an action exists; sorted oldest or newest first; paginated                                   | Brief CR1, D7      | `GET …/vehicles`                           |
| FR2  | Show one vehicle with its days in stock, tier and current action                                                                                                                  | Brief CR1          | `GET …/vehicles/{v}`                       |
| FR3  | Identify aging stock automatically: every vehicle read carries its tier, and a vehicle is aging when its days in stock exceed the dealership's aging threshold (default 90)       | Brief CR2, D1–D3   | List, detail, dashboard                    |
| FR4  | Display aging stock prominently: KPIs (total in stock, count per tier, aging with no action, average days in stock), age buckets, make and model breakdown, current-action counts | Brief CR2, D10–D12 | `GET …/dashboard`                          |
| FR5  | Log a proposed action (a type and an optional note) on an in-stock vehicle and persist it                                                                                         | Brief CR3, D4, D5  | `POST …/vehicles/{v}/actions`              |
| FR6  | Show a vehicle's action history, newest first                                                                                                                                     | Brief CR3          | `GET …/vehicles/{v}/actions`               |
| FR7  | Add a vehicle to stock                                                                                                                                                            | D8                 | `POST …/vehicles`                          |
| FR8  | Move a vehicle through `IN_STOCK ⇄ RESERVED`, either → `SOLD`                                                                                                                     | D6                 | `PATCH …/vehicles/{v}/status`              |
| FR9  | Read and change the dealership's time zone and aging thresholds                                                                                                                   | D3                 | `GET`/`PATCH …/settings`                   |
| FR10 | Log in, see one's dealerships and permissions, and reach only those dealerships, within one's role                                                                                | D13–D16            | `POST /auth/login`, `GET /me`, every route |

### 1.4 Non-functional requirements

The load the design is sized for is an assumption (§6.1): 50 dealerships, ≤ 2,000 in-stock vehicles each, dashboards polled every 10 s (about 25 requests/s at peak), about 50 writes per dealership per day.

| Quality              | Requirement                                                                                                                                | How it is met and checked                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Performance          | Dashboard and a 50-row list page: p95 ≤ 300 ms at 2,000 in-stock vehicles                                                                  | Indexed, tenant-scoped SQL; `EXPLAIN ANALYZE` at 8× that size: 39 ms and 46 ms (§7.1) |
| Scalability          | The sized load on one API instance and one Postgres; adding API replicas needs no code change                                              | Stateless API; the growth path in §7.10                                               |
| Freshness            | Data is at most one poll (10 s) old                                                                                                        | Every read computed fresh, `Cache-Control: no-store` (D9)                             |
| Consistency          | A status change can't race into an illegal state; no action lands on a vehicle that is no longer in stock                                  | Conditional SQL writes and database constraints, with concurrency tests (§7.6)        |
| Reliability          | A database outage fails readiness but not liveness; shutdown drains in-flight requests; bad configuration stops startup                    | Health endpoints, graceful shutdown, config validation (§7.8)                         |
| Security and tenancy | No read or write across dealerships; a non-member can't tell a dealership exists; least privilege per role; passwords hashed with argon2id | Guards on every route, 404 for non-members, permission checks, RBAC tests (§6.1)      |
| Maintainability      | A new action type or permission is one enum value, one map entry and tests; aging rules live in one pure function                          | Module ownership (§2.1); 100% coverage gate on `domain/**`                            |
| Observability        | Any `5xx` can be traced from its error body to its log line in under a minute                                                              | The problem+json `instance` is the request ID on the log line (§5)                    |
| Testability          | Day boundaries and time zones can be tested at a pinned instant                                                                            | `now` comes from the injected `Clock` and is passed to SQL as a parameter (§3.2)      |

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

The handler runs three statements (KPIs and buckets, make/model breakdown, current-action counts) in one `REPEATABLE READ, READ ONLY` transaction, so every section comes from the same snapshot ([isolation](https://www.postgresql.org/docs/current/transaction-iso.html)). It uses aggregate `FILTER` over the dealership's `IN_STOCK` rows only (D12), groups make and model case-insensitively under their most common spelling (ADR 0017) and a `LATERAL` join for each vehicle's latest action. "Aging with no action" means no action was ever logged; `MONITOR` counts as an action (D11). At ≤ 2,000 rows this is a millisecond query, so there is no cache.

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

## 6. Assumptions and trade-offs

### 6.1 Ambiguities in the brief, and the assumptions that resolve them

The brief leaves gaps and asks for reasonable assumptions to be documented. Each row names the question, the answer the system implements, why that answer was chosen, and what it changes in the design. The source column gives the decision number from the architecture doc (§2): **U** means I decided it when asked; **A** means the AI proposed it and I accepted it without a separate question (§8).

**Age and aging**

| Question                                    | Decision                                                                                                                                                                                                                                                | Why                                                                                                                                                                              | Impact on the design                                                                                                                                                                                                                                  | Source             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Which date does age count from?             | `stocked_on`, the date the vehicle arrived in this dealership's stock. Not the record's `created_at`, and not a purchase or registration date.                                                                                                          | The brief's "in inventory for > 90 days" is about time on this lot. A car can be entered days after it arrived, or come from another branch.                                     | `stocked_on` is required on intake and may be in the past. A `SOLD` vehicle's age freezes at its local sale date (`sold_at` in the dealership's zone − `stocked_on`).                                                                                 | D1 (U)             |
| How are days in stock counted?              | Calendar days in the dealership's time zone: `today_local − stocked_on`.                                                                                                                                                                                | Managers and DMS exports think in dates ("arrived 1 Aug"). A tier should flip at the dealership's midnight, not at UTC midnight (11:00 in Sydney). Date subtraction ignores DST. | `stocked_on` is a `date`, not a timestamp. Postgres computes `today_local` on every request (P1).                                                                                                                                                     | D2 (A)             |
| Is aging exactly "> 90 days"?               | Yes. `AGING` means days in stock **greater than** the aging threshold. The threshold defaults to 90 and is per dealership, with a `WATCH` tier from 60 days.                                                                                            | The brief says "> 90 days". Dealers differ (new and used stock, luxury and volume), and a watch tier warns before a car turns aging.                                             | `tierOf`: `FRESH` < watch ≤ `WATCH` ≤ aging < `AGING`. `?tier=AGING` becomes `stocked_on < today − aging`. Thresholds are bounded `1 ≤ watch < aging ≤ 3650` by a `CHECK` and `validateThresholds`.                                                   | D3 (U; bounds A)   |
| What about a car at exactly 90 days?        | It is `WATCH`, not `AGING`; it turns `AGING` at 91 days. In the fixed age buckets, 90 falls in 61–90, and the "90+" bucket starts at 91.                                                                                                                | "> 90" is strict, and the buckets must agree with the default tier.                                                                                                              | Unit tests pin the boundaries: 59 → `FRESH`, 60 → `WATCH`, 90 → `WATCH`, 91 → `AGING`; 90 → `61-90`, 91 → `90+`.                                                                                                                                      | D3, D10            |
| Which time zone, and how are dates handled? | Each dealership stores an IANA zone name. Only Postgres converts time zones. Names that are also abbreviations (`CET`, `UTC`) are rejected; `Etc/UTC` is the accepted spelling. Instants are stored as `timestamptz`; dates travel as ISO `YYYY-MM-DD`. | One tzdata source can't disagree with itself. Abbreviations are fixed offsets and would give the wrong local date in summer.                                                     | The context query returns `today_local` per request. `now` comes from the injected `Clock`, so tests can pin 23:30 and 00:30 local. A bad zone is `422 TIMEZONE_INVALID` ([ADR 0015](adr/0015-time-zone-must-be-a-zone-name-not-an-abbreviation.md)). | P1, D2             |
| Are age buckets tied to thresholds?         | No. They are fixed: 0–30, 31–60, 61–90, 90+.                                                                                                                                                                                                            | Buckets stay comparable across dealerships and over time, even after a threshold changes.                                                                                        | `bucketOf` ignores thresholds; the dashboard counts buckets with constant bounds.                                                                                                                                                                     | D10 (U; buckets A) |

**Statuses and actions**

| Question                                                      | Decision                                                                                                                                                                                                                                                                 | Why                                                                                                                  | Impact on the design                                                                                                                                                                  | Source                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Which statuses exist, and which moves are allowed?            | `IN_STOCK ⇄ RESERVED`, either → `SOLD`. `SOLD` is terminal. A move to the current state is 409.                                                                                                                                                                          | A reservation can fall through; a sale can't be undone here.                                                         | `allowedFrom(target)` feeds `UPDATE … WHERE status = ANY($allowedFrom)`; anything else is `409 INVALID_TRANSITION`. `CHECK (status = 'SOLD') = (sold_at IS NOT NULL)`.                | D6 (U)                |
| Which proposed actions are allowed?                           | A fixed type, `PRICE_REDUCTION_PLANNED`, `TRANSFER`, `AUCTION`, `PROMOTION`, `MONITOR` or `OTHER`, plus an optional note of up to 1,000 characters.                                                                                                                      | The dashboard counts actions by type, which free text can't do; `OTHER` with a note covers the rest.                 | A database enum and a zod enum; a new type is one enum value plus a migration.                                                                                                        | D4 (U; note length A) |
| Which vehicles can receive an action?                         | Any `IN_STOCK` vehicle, aging or not. `RESERVED` and `SOLD` vehicles get 409.                                                                                                                                                                                            | Aging cars are highlighted, not the only ones a manager may plan for; a reserved car is already leaving.             | The insert checks `status = 'IN_STOCK'` in the same statement ([ADR 0013](adr/0013-actions-read-vehicle-status-in-the-insert.md)), so a car sold a millisecond earlier can't get one. | D5 (U; RESERVED A)    |
| Does a new action overwrite the old one, or add to a history? | It adds to a history. Actions are append-only, never updated or deleted, and the newest by `id` is the current one.                                                                                                                                                      | Managers change their minds, and two managers may act on the same car; overwriting would lose one decision silently. | No update or delete endpoint. "Current action" is a `LIMIT 1` lookup on `(vehicle_id, id DESC)`. Concurrent actions both persist (P3).                                                | D4 (U), P3            |
| What is invalid when logging an action, and what happens?     | An unknown `actionType`, a note over 1,000 characters or containing a NUL character, or an unknown field → `400 VALIDATION_FAILED`. A vehicle that isn't `IN_STOCK` → `409 VEHICLE_NOT_IN_STOCK`. A missing vehicle → 404. A role without `vehicle_action:create` → 403. | Each status tells the client what to fix: the request, the vehicle's state, the id or the user's role.               | Validated by zod before the service runs; the state check is part of the insert. To change a decision, log a new action.                                                              | D4, D5                |
| What does "aging with no action" mean?                        | An aging `IN_STOCK` vehicle with no action ever logged. `MONITOR` counts as an action.                                                                                                                                                                                   | The KPI should find cars nobody has looked at; choosing `MONITOR` is a decision to wait, not neglect.                | The KPI is "aging and latest action is null"; there is no time window on actions.                                                                                                     | D11 (A)               |
| Which vehicles do the KPIs count?                             | `IN_STOCK` only; `RESERVED` and `SOLD` are excluded.                                                                                                                                                                                                                     | Reserved and sold cars no longer need a decision.                                                                    | Every dashboard statement filters `status = 'IN_STOCK'`.                                                                                                                              | D12 (U)               |

**Access and errors**

| Question                                        | Decision                                                                                                                                                                                                                                                                                                                              | Why                                                                                                                                               | Impact on the design                                                                                                                                                                                                         | Source         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Who can view or change a dealership's vehicles? | Only its members, by role. **Viewer** reads vehicles, the dashboard, actions and settings. **Manager** also adds vehicles, changes status and logs actions. **Admin** also changes settings. A user can belong to several dealerships with a different role in each. A non-member gets 404; a member without the permission gets 403. | The brief names managers; sales and stock staff need to read; someone must configure the dealership. Answering 404 hides which dealerships exist. | `user_dealership(user_id, dealership_id, role)`. `DealershipGuard` re-reads membership, role and user status on every request, so revoking access takes effect on the next call. Guards check permissions, never role names. | D15, D16 (U)   |
| What happens when a vehicle doesn't exist?      | 404 `NOT_FOUND`, whether the id is missing, malformed, or belongs to another dealership. The three cases can't be told apart.                                                                                                                                                                                                         | Telling them apart would let a member probe another dealership's vehicle ids.                                                                     | Every query filters on `dealership_id`; a malformed UUID is a 404 before any query runs; after a conditional write matches 0 rows, a re-read tells 404 from 409.                                                             | D16, P2        |
| How long does a login last?                     | One 1 h access token, no refresh token.                                                                                                                                                                                                                                                                                               | A stubbed client can't exercise cookie storage and token rotation, which is most of what a refresh flow needs.                                    | Users log in again every hour, and logout is client-side; revocation still works through the per-request re-read.                                                                                                            | D13 (U; TTL A) |
| Where do dealerships and users come from?       | The seed script. There is no sign-up and no admin API.                                                                                                                                                                                                                                                                                | The brief is about inventory; onboarding is a separate product surface.                                                                           | The seed is idempotent ([ADR 0009](adr/0009-seed-script-is-self-contained.md)).                                                                                                                                              | D17 (A)        |

**Input data**

| Question                             | Decision                                                                                                                                                                                                                                                                                                                                                                                                  | Why                                                                                          | Impact on the design                                                                                                                                                                                                  | Source  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| How does stock get into the system?  | Through the seed and `POST …/vehicles`, one vehicle at a time. There is no import.                                                                                                                                                                                                                                                                                                                        | Bulk import needs a file format, a per-row report and a DMS contract the brief doesn't give. | §7.10 lists CSV import and a DMS adapter as deferred. The design for when they are built: upsert by `(dealership_id, vin)`, delta only, a per-row report, one transaction for the valid rows (architecture doc §6.2). | D8 (U)  |
| What makes a vehicle record valid?   | VIN: trimmed, upper-cased, 17 characters from `A–H, J–N, P, R–Z, 0–9`. Make and model: trimmed, inner whitespace collapsed to one space, 1–100 characters, case stored as entered (ADR 0017). Model year 1900–2100. Mileage ≥ 0. Optional list price as a decimal string with up to 2 decimals. `stockedOn`: an ISO date from 1900-01-01 up to the dealership's local today. Unknown fields are rejected. | A future `stockedOn` would give negative days in stock; a VIN has a fixed format.            | Every rule is a 400 with a JSON pointer to the field. Make and model compare case-insensitively everywhere: the list filters and the dashboard's make and model breakdown (ADR 0017).                                 | D18 (A) |
| What if the same VIN is added twice? | A VIN is unique among a dealership's **unsold** vehicles. A second unsold one is `409 VIN_ALREADY_IN_STOCK`; a car bought back after a sale is a new row.                                                                                                                                                                                                                                                 | Dealers buy back cars they sold, and the sold car's history must stay as it was.             | A partial unique index arbitrates `ON CONFLICT … WHERE status <> 'SOLD'`; a re-acquired car's age starts again.                                                                                                       | D18 (A) |
| Who changed what?                    | `created_by`/`updated_by` and the action history are the audit trail.                                                                                                                                                                                                                                                                                                                                     | The brief names no compliance need.                                                          | No audit table. Status changes keep only the last `updated_by` and `updated_at`.                                                                                                                                      | D19 (A) |

**Load and client**

| Question                    | Decision                                                                                                                                                           | Why                                                                                                               | Impact on the design                                                                                                                          | Source                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| How much load?              | 50 dealerships, ≤ 2,000 in-stock vehicles each, 5 open dashboards per dealership polling every 10 s (about 25 requests/s), about 50 writes per dealership per day. | The brief gives no volumes. These describe a mid-sized dealer group, in round numbers that are easy to challenge. | One API instance and one Postgres; no cache, queue or replica; offset pagination. §7 says what changes when the numbers do.                   | Architecture doc §1.3 |
| What does "real-time" mean? | Every read is computed fresh, and the client polls every 10 s. The front end is stubbed.                                                                           | Stock changes tens of times a day, so 10 s is fresh enough, and polling is the simplest way to get it.            | No push channel. Inventory reads send `Cache-Control: no-store`. The committed OpenAPI document is the contract a real client would build on. | D9 (U)                |

### 6.2 Trade-offs of the current solution

What each main choice buys, what it costs, and what would make it change. The "Later" options are in §7; none of them is built.

| Choice                                                                                     | What it buys                                                                      | What it costs                                                                                                                                         | Revisit when                                                       |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Modular monolith, one Postgres                                                             | One deploy, one transaction boundary; cross-module reads are plain SQL            | Modules cannot scale or deploy apart; one database is a single point of failure                                                                       | Several teams, or reads and ingestion need to scale apart (§7.10)  |
| Aging derived on every read, never stored                                                  | Always correct, no nightly job to fail, a threshold change applies at once        | Every read recomputes age. A tier cannot be indexed, so `toStockedOnBounds` turns tier and age filters into `stocked_on` ranges                       | Never: a stored flag is wrong between runs (architecture doc §6.4) |
| Time-zone maths only in Postgres                                                           | One tzdata source; Node and the database cannot disagree about "today"            | Node cannot work out the local date alone, so every request needs the context query to get `today_local`                                              | —                                                                  |
| 10 s polling, no cache                                                                     | Stateless and always fresh; no cache to invalidate                                | Data is up to 10 s old; the dashboard query runs on every poll even when nothing changed                                                              | Polling reaches hundreds of requests/s (§7.10 stage 1)             |
| Offset pagination with `count(*) OVER ()`                                                  | Page numbers and a total in one query                                             | Cost grows with the offset and with the number of matching rows; a page can shift if a vehicle arrives between two requests                           | Tens of thousands of vehicles per dealership (§7.3)                |
| Latest action joined into the list ([ADR 0011](adr/0011-inventory-reads-latest-action.md)) | `currentAction` and the `hasAction` filter are correct across pages, in one query | A second cross-table read; the per-vehicle lookup runs for every matching row before `LIMIT` (39 ms at 16,000 in stock)                               | The list misses its p95 target (§7.9)                              |
| Conditional SQL writes, no locks or version columns                                        | Race-free transitions in one statement; no deadlocks, no retries                  | A 409 says the state was wrong, not who changed it                                                                                                    | Vehicles get field edits (§7.6)                                    |
| Append-only actions, newest is current                                                     | No lost update and a full history, with no versioning                             | Two managers acting at once both succeed and the later one becomes "current" without the first one being told; a retried `POST` logs the action twice | Conflicting decisions are reported (§7.6)                          |
| Roles re-read per request, never in the JWT                                                | A role change or removal takes effect on the next request                         | One indexed query per request; the token itself cannot be revoked, so logout is client-side                                                           | Immediate logout is required                                       |
| `404` for non-members                                                                      | Does not reveal which dealerships exist                                           | A client cannot tell "no access" from "wrong id"                                                                                                      | —                                                                  |
| Hardcoded roles, permission map in code                                                    | Small and fully tested; guards check permissions, never role names                | A new role needs a deploy                                                                                                                             | Dealers ask for custom roles                                       |
| In-memory login throttler (`shortcut:` in code)                                            | No Redis to run                                                                   | Correct only with one API instance                                                                                                                    | A second replica (§7.10 stage 2)                                   |

---

## 7. Build for the Future: scalability and reliability

The brief asks the design to consider scalability, performance, reliability, maintainability and observability. Observability is §5; maintainability comes from module ownership (§2.1), ADRs for every decision since the design, and the 100% coverage gate on `domain/**`. This section covers the rest. Each part separates **Today** (built and tested) from **Later** (designed, not built, with the trigger that would justify it).

### 7.1 When the number of vehicles grows

**Today.** The design targets ≤ 2,000 in-stock vehicles per dealership. The README's Performance evidence measures 8× that (about 16,000 in stock per dealership): a 50-row list page runs in 39 ms and the dashboard's three statements in about 46 ms, against a 300 ms target.

- **What grows with the in-stock count:** the list's latest-action lookup and window count (both run over every matching row) and the dashboard aggregates (they scan every in-stock row of the dealership on each poll).
- **What does not:** the per-request context query, every write (one row each) and the vehicle detail.
- **Other dealerships and sold cars barely matter.** Every query filters on `dealership_id`, and the main index leads with `(dealership_id, status)`, so neither other tenants' rows nor a growing `SOLD` history are in the range a default query reads.

**Later.** Keyset pagination (§7.3), conditional GETs, then a dashboard projection (§7.10).

### 7.2 Indexing strategy

Every index exists for a named query, and every vehicle index leads with the tenant key. There is nothing derived to index: age and tier are turned into `stocked_on` ranges first (§3.2).

| Index                                                                | Serves                                                                      | Evidence (README, 16,000 in stock)                   |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------- |
| `vehicle (dealership_id, status, stocked_on)`                        | Default list order, tier and age filters as date ranges, the dashboard scan | Bitmap Index Scan in all three dashboard statements  |
| `vehicle (dealership_id, lower(make), lower(model))`                 | Case-insensitive make and model filters                                     | Index Scan, 7 ms                                     |
| Partial unique `vehicle (dealership_id, vin) WHERE status <> 'SOLD'` | D18, and the `ON CONFLICT` arbiter for intake                               | Concurrent-insert test: exactly one `201`            |
| `vehicle_action (vehicle_id, id DESC)`                               | Latest action per vehicle, a backward index scan with `LIMIT 1`             | Index lookup per row in the list and dashboard plans |
| `user_dealership` PK `(user_id, dealership_id)`                      | The context query on every request                                          | —                                                    |
| `app_user UNIQUE lower(email)`                                       | Login lookup and case-insensitive uniqueness                                | —                                                    |

The default list plan is a Seq Scan at the measured size, because the seed puts a third of all vehicles in one dealership and the per-row lookup dominates the estimate. The README shows it as it comes out, untuned; at the designed spread of 50 dealerships a dealership is about 2% of the table.

**Later.** Append `id` to the first index when keyset pagination lands; add an index for each new sort key before exposing it.

### 7.3 Inventory pagination

**Today.** `limit` 1–100 (default 50) and `offset` ≥ 0, digits only (`1e2` or `0x10` is 400). The total comes from `count(*) OVER ()` in the same query; a page past the end runs one extra count so `total` stays right. The sort always ends in `id`, so pages are stable while the data doesn't change. A vehicle's action history is returned whole, newest first (a handful of entries per car).

**Later.** Keyset pagination on `(stocked_on, id)` with an opaque cursor, and the total made optional. Trigger: tens of thousands of vehicles per dealership or deep paging, because rows skipped by `OFFSET` are still computed ([LIMIT/OFFSET](https://www.postgresql.org/docs/current/queries-limit.html)).

### 7.4 Filtering and sorting

**Today.**

- **Filters:** `status` (a comma list, default `IN_STOCK`), `make` and `model` (case-insensitive, exact after trimming and collapsing inner whitespace, matching the `lower()` index), `tier`, `minAgeDays`/`maxAgeDays` and `hasAction` (any action ever logged). `AgingPolicy.toStockedOnBounds` turns tier and age into `stocked_on` bounds before SQL, so `?tier=AGING` is a range scan.
- **Sorting:** `oldest` (default, so aging stock comes first, D7) or `newest`, by `stocked_on` then `id`. The direction is one of two fixed SQL fragments, never a bound value.
- **Validation:** unknown parameters are 400; `tier` or an age filter combined with `status=SOLD` is 400 (a sold car's age is frozen at the sale, so "age today" doesn't apply); `minAgeDays > maxAgeDays` is 400.

**Later.** Prefix or fuzzy search on make and model (a trigram index), and sorting by price or mileage. Each new sort key gets its own index first; otherwise the query sorts every matching row.

### 7.5 Avoiding inefficient queries

**Today.**

- **Sargable filters only.** No function of a column in `WHERE` except `lower()`, which has its own index; derived values become date ranges.
- **No N+1.** The list joins the latest action in the same statement (`LEFT JOIN LATERAL … LIMIT 1` on the index). The dashboard is three statements per request at any size.
- **One context query per request** supplies role, thresholds and `today_local`; nothing looks them up again.
- **Bounded work.** `limit ≤ 100`; `statement_timeout` (default 5 s, `DB_STATEMENT_TIMEOUT_MS`) on every statement; a 2 s connection timeout.
- **Checked, not assumed.** `pnpm --filter @inventory/api db:explain` replays the exact SQL the services send under `EXPLAIN (ANALYZE, BUFFERS)`, so the plans cannot drift from the code.

**Known costs, left as they are:** the list's per-row lookup before `LIMIT` (§7.9), and Postgres JIT adding 5–10 ms to three statements.

**Later.** Page first, then join actions, if the list misses its target; that needs `hasAction` handled separately (why ADR 0011 joined first).

### 7.6 Data consistency on updates

**Today.** Every write is one statement whose `WHERE` carries the rule, and the database constraints catch whatever the code misses (§3.4).

- **Status change:** `UPDATE … WHERE status = ANY($allowedFrom)`; of two concurrent requests exactly one wins and the other gets 409.
- **Action:** `INSERT … SELECT … WHERE status = 'IN_STOCK'`, so a car sold a millisecond earlier cannot get an action.
- **Intake:** `ON CONFLICT` on the partial unique index; concurrent inserts of one VIN give one `201`.
- **Settings:** validated in `AgingPolicy`, then guarded by the `CHECK`; a racing commit that breaks it is a 422, not a 500.
- **Constraints:** `CHECK (status = 'SOLD') = (sold_at IS NOT NULL)`, the thresholds `CHECK`, and a composite foreign key so an action cannot point at another dealership's vehicle ([ADR 0012](adr/0012-composite-fk-on-vehicle-action.md)).
- **Reads:** the dashboard's three statements share one `REPEATABLE READ` snapshot, so its sections always add up.
- **Time:** `updated_at`, `sold_at` and `created_at` come from the injected `Clock` ([ADR 0002](adr/0002-updated-at-set-from-clock.md)).

The races are integration-tested against real Postgres, with a check that the race really happened.

**Later.** `If-Match` with a version for vehicle field edits and for actions (412 when stale); an `Idempotency-Key` on `POST`s for clients that retry; a transactional outbox when another system must see every change; an `audit_event` table for compliance.

### 7.7 Error handling

**Today.** One global exception filter turns every error into RFC 9457 problem+json with a stable `code` (§3.5):

| Status | When                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_FAILED`: bad shape, unknown fields, NUL characters in text, invalid filter combinations |
| 401    | Missing or invalid token, wrong credentials                                                         |
| 403    | A member whose role lacks the permission                                                            |
| 404    | Missing resource, or not a member of the dealership                                                 |
| 409    | `INVALID_TRANSITION`, `VEHICLE_NOT_IN_STOCK`, `VIN_ALREADY_IN_STOCK`                                |
| 422    | `THRESHOLDS_INVALID`, `TIMEZONE_INVALID`                                                            |
| 429    | `RATE_LIMITED` on login                                                                             |
| 500    | `INTERNAL`: no internals in the body; the stack goes to the log only                                |

Expected database errors are mapped by name (a `23514` on `dealership_thresholds_chk` → 422); anything else is a 500. Invalid configuration stops the process at startup, naming every bad variable.

**Later.** Retry guidance per route once `Idempotency-Key` exists (§7.6).

### 7.8 Detecting and handling failures

**Today.**

| Failure              | Detected by                                                                                 | Handled by                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Any request error    | Its log line (`status`, `duration_ms`, `req_id`); a 5xx is logged at `error` with the stack | The problem body's `instance` is the `req_id`, so a reported error finds its log line directly          |
| Database down        | `/health/ready` fails within about 2 s (connection timeout)                                 | Readiness `503`, so traffic stops; liveness stays green, so the process isn't restarted for a DB outage |
| Slow or stuck query  | `statement_timeout`                                                                         | Cancelled at 5 s; the caller gets a 500 with a request ID instead of a held connection                  |
| Idle connection lost | The pool's `error` event                                                                    | The pool drops the client and the next query reconnects                                                 |
| Shutdown             | `SIGTERM`                                                                                   | In-flight requests drain; readiness reports `503` meanwhile                                             |
| Bad configuration    | zod at startup                                                                              | The process exits non-zero before serving                                                               |

Retries are left to the client. A repeated status change is safe (it becomes 409), a repeated intake is safe (409 on the VIN), but a repeated action `POST` logs the action twice.

**Later.** Metrics with alerts on error rate and p95, and tracing (§5); `Idempotency-Key` makes action retries safe.

### 7.9 Bottlenecks to expect

In the order they are likely to appear as load grows:

1. **The list's per-row latest-action lookup.** Linear in matching in-stock rows; the first thing to feel growth (39 ms at 16,000).
2. **The dashboard on every poll.** About 25 requests/s today, proportional to open dashboards; identical work repeated when nothing changed.
3. **Database connections.** `node-postgres` pools default to 10 connections per instance; replicas multiply them.
4. **One Postgres.** CPU, and a single point of failure.
5. **The in-memory login throttler.** Blocks correct horizontal scaling until it moves to a shared store.

### 7.10 Growth path

Each stage starts only when its trigger fires, and builds on a seam that already exists.

| Stage                    | Trigger                                                        | Change                                                                                                                                                                                                                                                                                                                                                                                                                    | Seam already in place                                                                        |
| ------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1. Tune in place         | Polling reaches hundreds of requests/s, or the list misses p95 | Conditional GET: a weak ETag over a per-dealership version, the local date and the thresholds, so it also changes at midnight with no write; `304` skips the queries. Keyset pagination.                                                                                                                                                                                                                                  | The guard already loads `today_local` and thresholds; the index already ends in `stocked_on` |
| 2. Scale out the API     | Availability needs or API CPU                                  | N stateless replicas behind a load balancer; rate limiting at the gateway or in Redis; PgBouncer in front of Postgres; OpenTelemetry metrics and traces                                                                                                                                                                                                                                                                   | Stateless JWT; the throttler is the only in-memory state; request ID and structured logs     |
| 3. Separate reads (CQRS) | Dashboard reads saturate the database                          | First a read replica for `dashboard` (replica lag is far below the 10 s poll). Then a dashboard projection: counts per dealership kept up to date from events written by a transactional outbox, and SSE that tells clients to refetch. Because aging changes with no write, the projection stores counts by `stocked_on` date, not by tier, and derives tiers at read time.                                              | `dashboard` writes nothing and is already a separate read side; every write is one statement |
| 4. Split into services   | Several teams, or ingestion and reads need to scale apart      | Split along the modules: Identity (`auth`, `dealerships`), Inventory with ingestion (CSV import, DMS adapter), and Dashboard Query fed by events. The three cross-table reads are what must change: the dashboard moves to the projection, and `actions` likely stays with Inventory, because a separate service would lose the atomic status check of [ADR 0013](adr/0013-actions-read-vehicle-status-in-the-insert.md). | Modules own their tables and import nothing from each other except `auth` and one pure rule  |
| 5. Cells per region      | Data residency                                                 | Region-pinned deployments, routed by dealership                                                                                                                                                                                                                                                                                                                                                                           | `dealership_id` on every row and path                                                        |

Features deferred for other reasons:

| Deferred                           | Trigger                                      | Why it's cheap later                                              |
| ---------------------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| Refresh tokens, server-side logout | A real SPA ships / immediate logout required | Context query already runs per request                            |
| `If-Match` on actions              | Conflicting decisions reported               | Append-only table; add a sequence column                          |
| CSV import, DMS adapter            | Real dealership data arrives                 | Partial unique `(dealership_id, vin)` is the upsert target        |
| Custom roles, row-level security   | Dealers ask / many teams write queries       | Guards check permissions, not roles; `dealership_id` on every row |

---

## 8. How GenAI was used in the design phase

I used an AI agent as researcher and drafter; I made the decisions and I am responsible for them. The full log, with links to every issue, PR and review comment, is [`ai-collaboration.md`](ai-collaboration.md).

### 8.1 Tools

- **Claude Code with Claude Opus:** the research, the architecture doc, this document, the ADRs and the diagrams; later the build, through the `/deliver` skill and its role agents in `.claude/`.
- **Skills:** `mattpocock-skills` (research, grilling, domain modeling, spec, code review), `diagram-design` for every diagram, `ponytail` for anti-over-engineering review.
- **ChatGPT**, once, as a second opinion on the workflow (C6 in the log).

### 8.2 What the AI helped with

1. **Reading the brief.** It extracted the requirements word for word into the architecture doc (§0), so later decisions trace back to the brief, not to a paraphrase (§7 of that doc).
2. **Research.** It researched the unknowns (Postgres time-zone conversion, Drizzle transactions, RFC 9110/9457/8725, OWASP password storage) in official docs and specs, and linked every claim to its source.
3. **Drafting decisions.** It drafted D1–D19 and named the three correctness problems (P1–P3) with a test row each (§4.15 of that doc).
4. **Alternatives.** It wrote each deferred option with the trigger that would bring it back (architecture doc §6, now §7 here).
5. **Diagrams and this document.** It drew the diagrams and condensed the architecture doc into this page.

### 8.3 How I gave it context and requirements

- **The brief, verbatim,** as the first section of the architecture doc.
- **Sizing up front** (§1.4), so every proposal was judged against a load, not in the abstract.
- **Standing instructions** in `CLAUDE.md`, loaded by every session: the invariants (aging derived, time zones only in Postgres, conditional writes, 404 for non-members), the module rules and the workflow. The frozen architecture doc and the ADRs are the only sources of truth, with `GLOSSARY.md` for terms.
- **How to ask.** An ambiguity comes back as numbered questions with options A, B, C and a named recommendation. A conflict with the design stops for me even when the agent may otherwise decide alone.

### 8.4 How I evaluated its proposals

- **Traceability:** a decision had to serve a requirement of the brief.
- **Sources:** a claim without a primary source was not accepted. Research overturned the agent's own premises twice: zod's length check (C26) and time-zone abbreviations (C36).
- **The sizing:** anything whose trigger the §1.4 load does not reach was deferred (cache, queue, replicas, keyset pagination).
- **The code, once it existed:** a design claim was checked against the imports and queries before it was relied on (C35).
- **Tests and measurement:** each correctness problem has a test, and the p95 target was measured with `EXPLAIN ANALYZE` at 8× the designed size.
- **Independent review:** during the build, two reviewer agents that did not write the code check each PR against the issue, the design and the standards, and each PR merges only when I say so.

### 8.5 Accepted, rejected and changed

| AI proposal                                                                                                                      | Outcome                 | Why                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Age derived from `stocked_on`, time zones only in Postgres, `AgingPolicy` (P1)                                                   | Accepted                | Correct at every instant with no job, and one tzdata source                                                                                                                                          |
| Conditional SQL writes instead of locks (P2); append-only actions (P3)                                                           | Accepted                | Race-free in one statement, and provable with concurrency tests                                                                                                                                      |
| Permissions, not roles, in guards; 404 for non-members                                                                           | Accepted                | Custom roles later without touching controllers; no tenant enumeration                                                                                                                               |
| Five assumptions (D2, D11, D17, D18, D19)                                                                                        | Accepted as assumptions | Listed with their reasons in §6.1, so a reviewer sees what was assumed rather than asked                                                                                                             |
| Cutting revision 4 to one buildable MVP (the agent's own call)                                                                   | Accepted                | Eleven features from earlier revisions (refresh-token rotation, CSV import, ETag polling, audit table, role tables, keyset pagination and others) moved to §7 with their triggers                    |
| Mermaid diagrams                                                                                                                 | Rejected (C2)           | Diagrams are drawn with `diagram-design`, exported to SVG, and the rendered image is read before publishing                                                                                          |
| ChatGPT's workflow: separate requirements and business-rules files, "transactions for multi-step mutations", CSV import in scope | Rejected (C6)           | A second source of truth, a clash with P2, and a scope the MVP cut. The AI recommended rejecting them; I agreed                                                                                      |
| Build all routes before the API docs (the AI's recommended option A)                                                             | Changed (C13)           | I chose option B: scaffold OpenAPI and `/docs` early so the API could be browsed while it grew                                                                                                       |
| §4.2 "only `dashboard` reads across tables", while §4.4 joined actions into the list                                             | Changed (C15)           | The design contradicted itself. I chose to keep the join and narrow the rule ([ADR 0011](adr/0011-inventory-reads-latest-action.md)), because paging first breaks the `hasAction` filter             |
| §4.2's `inventory → dealerships` dependency                                                                                      | Corrected (C35)         | The edge never existed in code; `validateThresholds` stays in `AgingPolicy` and `dealerships` imports only that function ([ADR 0014](adr/0014-dealerships-uses-aging-policy-validate-thresholds.md)) |
| P1 accepted any time-zone name Postgres knows                                                                                    | Narrowed (C36)          | `CET` or `UTC` are read as fixed offsets and give the wrong local date in summer ([ADR 0015](adr/0015-time-zone-must-be-a-zone-name-not-an-abbreviation.md))                                         |

### 8.6 Where the AI was wrong, and what changed because of it

The log records each mistake I or a reviewer caught; the ones that changed how I work with the agent:

- **Docs drifted from code.** ADRs were written after the code merged, and this document had no GenAI section (C6). Docs now move with the code in the same PR, and every PR lists its **Doc impact**. The agent later still wrote "no change" for this document when a PR had made one of its sentences untrue (C45), so **Doc impact** now also checks every doc that cites an amended ADR.
- **Summaries that hid gaps.** "Deviations: none" covered real differences from the spec more than once (C4, C16, C19). An agent's summary is now a claim for a reviewer to check, not a record.
- **Claims without evidence.** The implementer reported `pnpm verify` green when it had failed (C12), and a PR-body edit it had not made (C20). Evidence is now the pasted command output.
- **Red CI ignored.** Agents merged four PRs while `dev` was red (C23). Agents now watch the checks after every push, and a PR isn't done until they are green.
- **Tests that could not fail.** Race, frozen-age, tenancy and time-zone tests passed whether or not the code was right (C33, C34, C37). Each was rewritten to fail when the rule breaks. Race tests now go through a helper that proves the race happened, and a script checks that each acceptance criterion names a test (C39).

### 8.7 Why this design, and who owns it

The final design meets the brief at the stated load with the fewest moving parts: one process, one database, five tables. The database enforces the rules a race could break, and every part I left out has a trigger and a seam (§7). Where the agent and I disagreed, my call stands and the reasons are in the log. Under the `/deliver` workflow's auto modes the agent took its own recommendation on build-level choices; the log marks each of those, and a PR merges only when I say so.

The AI researched, drafted and reviewed. I decided, and I am accountable for every design decision in this document, including the ones the AI proposed and I accepted.
