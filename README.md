# Intelligent Inventory Dashboard

Backend for a dealership inventory dashboard (Keyloop technical assessment, Scenario B). It gives dealership managers a live view of their vehicle stock:

- **Inventory list** filterable by make, model and age.
- **Aging stock**: vehicles in stock for more than 90 days (configurable per dealership) are flagged.
- **Actions**: managers log a status or planned action per vehicle (e.g. "Price Reduction Planned"), kept as a history.

A REST API (NestJS 12, TypeScript) on PostgreSQL. The System Design Document is [`docs/system-design.md`](docs/system-design.md); the full design research (data model, API, decisions and trade-offs) is in [`docs/research/backend-architecture.md`](docs/research/backend-architecture.md), and later decisions are ADRs in [`docs/adr/`](docs/adr/README.md).

> **Status:** the MVP is complete. Tooling, validated config, the Drizzle schema and migration, the injected `Clock`, problem+json errors with a request ID and structured pino logging, health checks (readiness pings Postgres), Docker Compose, the aging rules (`AgingPolicy`) with tests, auth (login, JWT, dealership guards, permissions, `/me`, `pnpm db:seed`), the vehicle list, detail, intake and status-change endpoints with derived age and tier, the dashboard KPI endpoint, the vehicle action endpoints (log and history), the dealership settings endpoints (read and update), and the OpenAPI document (Swagger UI at `/docs`, committed `docs/api/openapi.json`) are in place, with curl examples for every route and `EXPLAIN ANALYZE` evidence for the list and dashboard queries.

## Prerequisites

- Node.js 24 (`nvm use` reads `.nvmrc`)
- pnpm, via corepack: `corepack enable` (the version is pinned in `package.json`)
- Docker, for Postgres and the integration tests (Testcontainers)

## Getting started

The quickest run is `docker compose up --build`: Postgres, migrations, then the API on port 3000. To develop with Node on the host:

```sh
nvm use
corepack enable
pnpm install                                   # also installs the git hooks
docker compose up -d postgres
cp apps/api/.env.example apps/api/.env
pnpm --filter @inventory/api db:migrate
pnpm --filter @inventory/api db:seed             # demo users, vehicles and action history; prints new users' random passwords once (or set SEED_PASSWORD; SEED_VEHICLES_PER_DEALERSHIP sets the vehicle count)
pnpm dev                                       # API on http://localhost:3000, restarts on change
```

Environment variables and the steps per environment are in [`docs/environment-setup.md`](docs/environment-setup.md).

Check it is up:

```sh
curl localhost:3000/health/live    # 200 while the process runs
curl localhost:3000/health/ready   # 200 when Postgres answers, 503 when it doesn't
```

API docs: with the API running (not when `NODE_ENV=production`), Swagger UI is at <http://localhost:3000/docs> and the raw document at `/docs-json`. The same document is committed as [`docs/api/openapi.json`](docs/api/openapi.json); after changing a route or schema, regenerate it (a test fails if it drifts):

```sh
pnpm --filter @inventory/api openapi:export
```

Try every route with curl (needs `jq`; `pnpm db:seed` prints the passwords). The script logs in, finds the user's first dealership, creates its own vehicle and leaves the settings as it found them; use a user with every permission, such as the seeded admin:

```sh
EMAIL=admin@example.dev PASSWORD=<its password> bash docs/api/curl-examples.sh
```

Production build:

```sh
pnpm build
node apps/api/dist/main.js
```

## Scripts

Run from the repo root; Turborepo runs them in every workspace package.

| Command                 | Does                                                     |
| ----------------------- | -------------------------------------------------------- |
| `pnpm dev`              | Start the API in watch mode                              |
| `pnpm build`            | Compile to `apps/api/dist`                               |
| `pnpm lint`             | ESLint, zero warnings allowed                            |
| `pnpm typecheck`        | `tsc --noEmit`                                           |
| `pnpm test`             | Unit tests                                               |
| `pnpm test:integration` | Integration tests against real Postgres (needs Docker)   |
| `pnpm test:cov`         | All tests with coverage: 80% global, 100% on domain code |
| `pnpm format`           | Prettier                                                 |

Run one test file or test by name:

```sh
pnpm --filter @inventory/api exec vitest run test/unit/inventory/aging-policy.spec.ts
pnpm --filter @inventory/api exec vitest run -t "tierOf"
```

## Performance evidence

Target (§1.4): the dashboard and a 50-row list page answer in p95 ≤ 300 ms at 2,000 in-stock vehicles. The plans below are at **8× that size**: `SEED_VEHICLES_PER_DEALERSHIP=20000`, which is about 16,000 in-stock vehicles per dealership (60,003 vehicles and about 19,000 actions over the three seeded dealerships). Every statement runs in under 50 ms, so the target holds with a wide margin.

Reproduce (the seed must go into an **empty** database: it adds actions only to a dealership that has none, so seeding 20,000 on top of the default 250 leaves almost no actions):

```sh
docker compose down -v && docker compose up -d postgres
cp apps/api/.env.example apps/api/.env
pnpm --filter @inventory/api db:migrate
SEED_VEHICLES_PER_DEALERSHIP=20000 pnpm --filter @inventory/api db:seed
pnpm --filter @inventory/api db:explain
```

`db:explain` ([`src/explain-queries.ts`](apps/api/src/explain-queries.ts)) runs `ANALYZE`, then calls the real `VehiclesService.list` and `DashboardService.get` for the London dealership with a logger that records each SQL statement, and replays every recorded `SELECT` as `EXPLAIN (ANALYZE, BUFFERS)` with the same text and parameters. The plans therefore come from the SQL the app really sends and cannot drift from the code. Execution times are from one run on a laptop (PostgreSQL 17.11 in Docker, warm cache, 2026-11-03); yours will differ.

| Case                                       | Plan                                                         | Execution |
| ------------------------------------------ | ------------------------------------------------------------ | --------- |
| List, default (in stock, oldest, limit 50) | Seq Scan on `vehicle`, latest-action index lookup per row    | 45 ms     |
| List, `tier=AGING`                         | Seq Scan, same shape                                         | 25 ms     |
| List, `make=Toyota&model=Corolla`          | Index Scan on `vehicle_dealership_make_model_idx`            | 0.6 ms    |
| List, `tier=AGING&hasAction=false`         | Seq Scan, same shape                                         | 19 ms     |
| Dashboard, KPIs and age buckets            | Bitmap Index Scan on `vehicle_dealership_status_stocked_idx` | 23 ms     |
| Dashboard, make and model                  | Bitmap Index Scan on `vehicle_dealership_status_stocked_idx` | 5 ms      |
| Dashboard, current-action counts           | Bitmap Index Scan, then latest-action index lookup per row   | 24 ms     |

Reading the plans:

- **List.** The cost is the latest-action lookup (`LEFT JOIN LATERAL … ORDER BY id DESC LIMIT 1`, an index scan on `vehicle_action_vehicle_id_idx` per vehicle) for every matching row before the `LIMIT`, because the total (`count(*) OVER ()`) and the sort sit above the join. It grows linearly with the in-stock count, so it is about 45 ms at 16,000 and a fraction of that at 2,000. The planner picks a Seq Scan of `vehicle` here: that join is estimated at about 10 cost units per row, which swamps the difference between the scan paths, and the seed puts a third of the table in one dealership (at the designed 50 dealerships it would be about 2%). Shown as it comes out, not tuned. Filtering by make and model uses its index and takes under a millisecond.
- **Dashboard.** Three statements in one `REPEATABLE READ` read-only transaction, each a Bitmap Index Scan on `vehicle_dealership_status_stocked_idx` (dealership, status, `stocked_on`), then an aggregate. The "aging with no action" subquery and the current-action counts use the same `vehicle_action_vehicle_id_idx` lookup.
- **JIT.** PostgreSQL's JIT compiler fires on three statements (the list default and two dashboard statements) because the lookup's cost estimate passes `jit_above_cost`; it adds 5 to 10 ms each. Turning it off is a server tuning decision, outside this evidence.

<details>
<summary>Full <code>db:explain</code> output</summary>

```text
$ nest build && node --env-file-if-exists=.env dist/explain-queries.js

Postgres 17.11, dealership London, today_local 2026-11-03

=== List: default (IN_STOCK, oldest first, limit 50) (statement 1 of 1)
Limit  (cost=169245.35..169245.47 rows=50 width=184) (actual time=44.429..44.435 rows=50 loops=1)
  Buffers: shared hit=36718
  ->  Sort  (cost=169245.35..169285.38 rows=16012 width=184) (actual time=35.184..35.187 rows=50 loops=1)
        Sort Key: v.stocked_on, v.id
        Sort Method: top-N heapsort  Memory: 36kB
        Buffers: shared hit=36718
        ->  WindowAgg  (cost=168342.66..168713.44 rows=16012 width=184) (actual time=25.444..31.160 rows=16020 loops=1)
              Buffers: shared hit=36718
              ->  Nested Loop Left Join  (cost=0.29..168153.02 rows=16012 width=128) (actual time=0.038..21.444 rows=16020 loops=1)
                    Buffers: shared hit=36718
                    ->  Seq Scan on vehicle v  (cost=0.00..2002.07 rows=16012 width=92) (actual time=0.017..6.525 rows=16020 loops=1)
                          Filter: ((status = ANY ('{IN_STOCK}'::text[])) AND (dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid))
                          Rows Removed by Filter: 43985
                          Buffers: shared hit=1177
                    ->  Limit  (cost=0.29..10.36 rows=1 width=60) (actual time=0.001..0.001 rows=0 loops=16020)
                          Buffers: shared hit=35541
                          ->  Index Scan using vehicle_action_vehicle_id_idx on vehicle_action a  (cost=0.29..10.36 rows=1 width=60) (actual time=0.001..0.001 rows=0 loops=16020)
                                Index Cond: (vehicle_id = v.id)
                                Filter: (dealership_id = v.dealership_id)
                                Buffers: shared hit=35541
Planning Time: 0.154 ms
JIT:
  Functions: 16
  Options: Inlining false, Optimization false, Expressions true, Deforming true
  Timing: Generation 0.725 ms (Deform 0.381 ms), Inlining 0.000 ms, Optimization 0.296 ms, Emission 8.979 ms, Total 10.000 ms
Execution Time: 45.352 ms

=== List: tier=AGING (statement 1 of 1)
Limit  (cost=93513.37..93513.50 rows=50 width=184) (actual time=24.653..24.664 rows=50 loops=1)
  Buffers: shared hit=22182
  ->  Sort  (cost=93513.37..93535.24 rows=8747 width=184) (actual time=24.651..24.654 rows=50 loops=1)
        Sort Key: v.stocked_on, v.id
        Sort Method: top-N heapsort  Memory: 37kB
        Buffers: shared hit=22182
        ->  WindowAgg  (cost=93015.36..93222.80 rows=8747 width=184) (actual time=18.510..22.405 rows=8752 loops=1)
              Buffers: shared hit=22182
              ->  Nested Loop Left Join  (cost=0.29..92916.66 rows=8747 width=128) (actual time=0.025..16.166 rows=8752 loops=1)
                    Buffers: shared hit=22182
                    ->  Seq Scan on vehicle v  (cost=0.00..2152.08 rows=8747 width=92) (actual time=0.007..7.491 rows=8752 loops=1)
                          Filter: ((status = ANY ('{IN_STOCK}'::text[])) AND (stocked_on <= '2026-08-04'::date) AND (dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid))
                          Rows Removed by Filter: 51253
                          Buffers: shared hit=1177
                    ->  Limit  (cost=0.29..10.36 rows=1 width=60) (actual time=0.001..0.001 rows=0 loops=8752)
                          Buffers: shared hit=21005
                          ->  Index Scan using vehicle_action_vehicle_id_idx on vehicle_action a  (cost=0.29..10.36 rows=1 width=60) (actual time=0.001..0.001 rows=0 loops=8752)
                                Index Cond: (vehicle_id = v.id)
                                Filter: (dealership_id = v.dealership_id)
                                Buffers: shared hit=21005
Planning Time: 0.159 ms
Execution Time: 24.786 ms

=== List: make=Toyota&model=Corolla (statement 1 of 1)
Limit  (cost=7786.58..7786.71 rows=50 width=184) (actual time=0.588..0.591 rows=20 loops=1)
  Buffers: shared hit=439
  ->  Sort  (cost=7786.58..7788.19 rows=642 width=184) (actual time=0.588..0.589 rows=20 loops=1)
        Sort Key: v.stocked_on, v.id
        Sort Method: quicksort  Memory: 27kB
        Buffers: shared hit=439
        ->  WindowAgg  (cost=7738.74..7765.26 rows=642 width=184) (actual time=0.570..0.576 rows=20 loops=1)
              Buffers: shared hit=439
              ->  Nested Loop Left Join  (cost=0.58..7742.79 rows=642 width=128) (actual time=0.064..0.560 rows=20 loops=1)
                    Buffers: shared hit=439
                    ->  Index Scan using vehicle_dealership_make_model_idx on vehicle v  (cost=0.29..1080.98 rows=642 width=92) (actual time=0.054..0.526 rows=20 loops=1)
                          Index Cond: ((dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid) AND (lower(make) = 'toyota'::text) AND (lower(model) = 'corolla'::text))
                          Filter: (status = ANY ('{IN_STOCK}'::text[]))
                          Rows Removed by Filter: 3983
                          Buffers: shared hit=399
                    ->  Limit  (cost=0.29..10.36 rows=1 width=60) (actual time=0.001..0.001 rows=0 loops=20)
                          Buffers: shared hit=40
                          ->  Index Scan using vehicle_action_vehicle_id_idx on vehicle_action a  (cost=0.29..10.36 rows=1 width=60) (actual time=0.001..0.001 rows=0 loops=20)
                                Index Cond: (vehicle_id = v.id)
                                Filter: (dealership_id = v.dealership_id)
                                Buffers: shared hit=40
Planning Time: 0.118 ms
Execution Time: 0.633 ms

=== List: tier=AGING&hasAction=false (statement 1 of 1)
Limit  (cost=92916.70..92916.71 rows=1 width=184) (actual time=19.403..19.410 rows=50 loops=1)
  Buffers: shared hit=22182
  ->  Sort  (cost=92916.70..92916.71 rows=1 width=184) (actual time=19.402..19.406 rows=50 loops=1)
        Sort Key: v.stocked_on, v.id
        Sort Method: top-N heapsort  Memory: 36kB
        Buffers: shared hit=22182
        ->  WindowAgg  (cost=0.29..92916.69 rows=1 width=184) (actual time=16.969..18.149 rows=5251 loops=1)
              Buffers: shared hit=22182
              ->  Nested Loop Left Join  (cost=0.29..92916.66 rows=1 width=128) (actual time=0.012..15.766 rows=5251 loops=1)
                    Filter: (a.action_type IS NULL)
                    Rows Removed by Filter: 3501
                    Buffers: shared hit=22182
                    ->  Seq Scan on vehicle v  (cost=0.00..2152.08 rows=8747 width=92) (actual time=0.005..7.299 rows=8752 loops=1)
                          Filter: ((status = ANY ('{IN_STOCK}'::text[])) AND (stocked_on <= '2026-08-04'::date) AND (dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid))
                          Rows Removed by Filter: 51253
                          Buffers: shared hit=1177
                    ->  Limit  (cost=0.29..10.36 rows=1 width=60) (actual time=0.001..0.001 rows=0 loops=8752)
                          Buffers: shared hit=21005
                          ->  Index Scan using vehicle_action_vehicle_id_idx on vehicle_action a  (cost=0.29..10.36 rows=1 width=60) (actual time=0.001..0.001 rows=0 loops=8752)
                                Index Cond: (vehicle_id = v.id)
                                Filter: (dealership_id = v.dealership_id)
                                Buffers: shared hit=21005
Planning Time: 0.104 ms
Execution Time: 19.479 ms

=== Dashboard (statement 1 of 3)
Aggregate  (cost=168701.21..168701.25 rows=1 width=44) (actual time=22.500..22.501 rows=1 loops=1)
  Buffers: shared hit=21417
  ->  Bitmap Heap Scan on vehicle v  (cost=252.41..1669.59 rows=16012 width=36) (actual time=0.416..1.859 rows=16020 loops=1)
        Recheck Cond: ((dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid) AND (status = 'IN_STOCK'::text))
        Heap Blocks: exact=394
        Buffers: shared hit=412
        ->  Bitmap Index Scan on vehicle_dealership_status_stocked_idx  (cost=0.00..248.41 rows=16012 width=0) (actual time=0.382..0.382 rows=16022 loops=1)
              Index Cond: ((dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid) AND (status = 'IN_STOCK'::text))
              Buffers: shared hit=18
  SubPlan 1
    ->  Index Scan using vehicle_action_vehicle_id_idx on vehicle_action a  (cost=0.29..10.36 rows=1 width=0) (actual time=0.001..0.001 rows=0 loops=8752)
          Index Cond: (vehicle_id = v.id)
          Filter: (dealership_id = v.dealership_id)
          Buffers: shared hit=21005
Planning Time: 0.133 ms
JIT:
  Functions: 15
  Options: Inlining false, Optimization false, Expressions true, Deforming true
  Timing: Generation 0.903 ms (Deform 0.214 ms), Inlining 0.000 ms, Optimization 0.255 ms, Emission 9.492 ms, Total 10.650 ms
Execution Time: 23.483 ms

=== Dashboard (statement 2 of 3)
Sort  (cost=1910.73..1910.79 rows=25 width=18) (actual time=4.963..4.963 rows=5 loops=1)
  Sort Key: ((count(*))::integer) DESC, make, model
  Sort Method: quicksort  Memory: 25kB
  Buffers: shared hit=412
  ->  HashAggregate  (cost=1909.77..1910.15 rows=25 width=18) (actual time=4.952..4.953 rows=5 loops=1)
        Group Key: make, model
        Batches: 1  Memory Usage: 24kB
        Buffers: shared hit=412
        ->  Bitmap Heap Scan on vehicle v  (cost=252.41..1669.59 rows=16012 width=14) (actual time=0.374..1.525 rows=16020 loops=1)
              Recheck Cond: ((dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid) AND (status = 'IN_STOCK'::text))
              Heap Blocks: exact=394
              Buffers: shared hit=412
              ->  Bitmap Index Scan on vehicle_dealership_status_stocked_idx  (cost=0.00..248.41 rows=16012 width=0) (actual time=0.345..0.345 rows=16022 loops=1)
                    Index Cond: ((dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid) AND (status = 'IN_STOCK'::text))
                    Buffers: shared hit=18
Planning:
  Buffers: shared hit=4
Planning Time: 0.105 ms
Execution Time: 4.997 ms

=== Dashboard (statement 3 of 3)
GroupAggregate  (cost=168938.73..169058.84 rows=1 width=36) (actual time=22.171..23.769 rows=7 loops=1)
  Group Key: (COALESCE(a.action_type, 'NONE'::text))
  Buffers: shared hit=35953
  ->  Sort  (cost=168938.73..168978.76 rows=16012 width=32) (actual time=22.125..22.682 rows=16020 loops=1)
        Sort Key: (COALESCE(a.action_type, 'NONE'::text))
        Sort Method: quicksort  Memory: 385kB
        Buffers: shared hit=35953
        ->  Nested Loop Left Join  (cost=252.70..167820.55 rows=16012 width=32) (actual time=5.155..20.866 rows=16020 loops=1)
              Buffers: shared hit=35953
              ->  Bitmap Heap Scan on vehicle v  (cost=252.41..1669.59 rows=16012 width=32) (actual time=0.404..1.764 rows=16020 loops=1)
                    Recheck Cond: ((dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid) AND (status = 'IN_STOCK'::text))
                    Heap Blocks: exact=394
                    Buffers: shared hit=412
                    ->  Bitmap Index Scan on vehicle_dealership_status_stocked_idx  (cost=0.00..248.41 rows=16012 width=0) (actual time=0.372..0.372 rows=16022 loops=1)
                          Index Cond: ((dealership_id = '00000000-0000-4000-8000-0000000000d1'::uuid) AND (status = 'IN_STOCK'::text))
                          Buffers: shared hit=18
              ->  Limit  (cost=0.29..10.36 rows=1 width=18) (actual time=0.001..0.001 rows=0 loops=16020)
                    Buffers: shared hit=35541
                    ->  Index Scan using vehicle_action_vehicle_id_idx on vehicle_action a  (cost=0.29..10.36 rows=1 width=18) (actual time=0.001..0.001 rows=0 loops=16020)
                          Index Cond: (vehicle_id = v.id)
                          Filter: (dealership_id = v.dealership_id)
                          Buffers: shared hit=35541
Planning Time: 0.093 ms
JIT:
  Functions: 15
  Options: Inlining false, Optimization false, Expressions true, Deforming true
  Timing: Generation 0.405 ms (Deform 0.144 ms), Inlining 0.000 ms, Optimization 0.186 ms, Emission 4.565 ms, Total 5.155 ms
Execution Time: 24.268 ms
```

</details>

## Project structure

```
apps/api/            NestJS API (the whole backend, one modular monolith)
  src/modules/       one folder per module; pure business rules in <module>/domain/
  test/unit/         fast tests, no I/O
  test/integration/  tests against Postgres via Testcontainers
  db/migrations/     SQL migrations generated by drizzle-kit
docs/
  system-design.md   System Design Document
  api/               committed openapi.json and curl-examples.sh
  research/          design research (decisions D1–D19, P1–P3)
  adr/               decisions made since
  diagrams/          diagram sources (HTML) and exported SVGs; specs/issue-<N>/ holds each spec's diagrams
  ai-collaboration.md  log of how the AI was directed and verified
.claude/             the /deliver skill and its role agents
```

## AI Collaboration Narrative

The code, tests and docs here were written by an AI agent (Claude Code, Claude Opus) that I directed. I owned the decisions and the verification. The evidence, case by case with links, is in [`docs/ai-collaboration.md`](docs/ai-collaboration.md).

**Strategy: decide first, then let the agent build inside the decisions.**

- **Design before code.** The agent researched primary sources and drafted the design ([`backend-architecture.md`](docs/research/backend-architecture.md)). Every decision is numbered and marked as mine (**U**, 14 of 19) or the agent's assumption (**A**, 5), and the assumptions are listed in the System Design Document. Later decisions are ADRs.
- **Rules the agent can't miss.** `CLAUDE.md` holds the invariants that are easy to get wrong (aging is derived, time zones only in Postgres, race-free conditional writes, 404 for non-members, append-only actions), so every session and every agent starts from them.
- **One requirement at a time, through fixed roles.** The `/deliver` skill (`.claude/skills/deliver/`) takes one issue through analyst, architect, contract, implementer, code reviewer, business reviewer and tester. Its gates can stop for my approval (`grill=manual`, `approve=manual`) or let the agent take its own recommendation (`auto`). So far everything after the design research ran in `auto`: the agent made the build decisions and picked the contract options, and the independent reviewers below were the check. When an agent hits a choice the spec doesn't settle, it stops with `decision-needed` instead of guessing.

**Verification: the author never approves its own work.**

- Reviewers and the tester are separate agents, spawned fresh with only the PR and the issue. They treat the author's description and passing tests as claims to check. The code reviewer hunts defects and over-engineering; the business reviewer checks the PR against the issue, the contract, the design and the docs; the tester runs the API on a real Postgres and walks each acceptance criterion with `curl`.
- Findings go back to a fresh implementer, and the next review looks only at the fixes, for at most three rounds before I'm asked.
- Machines check what they can: strict TypeScript, ESLint with zero warnings, Prettier, commitlint and branch-name hooks, CI, and a coverage gate (80% global, 100% on the pure domain rules). Integration tests run against real Postgres (Testcontainers), because the rules under test are SQL date maths and constraints.

**What it caught.** On the first feature (#17), the reviewers found three problems the implementer's own tests passed: a Drizzle `$onUpdate` timestamp that bypassed the injected `Clock` (now [ADR 0002](docs/adr/0002-updated-at-set-from-clock.md)), a primary key name that differed from the agreed contract while the PR claimed "no deviations", and a coverage exclusion the documented standard didn't allow. All three were fixed in one round.

**Keeping quality and docs honest.** Each PR lists its **Doc impact** (design doc, diagrams, ADRs, Status), and the business reviewer treats a missing update as a finding. After each PR the agent runs a retrospective and proposes changes to its own instructions and checks; I approve them first. I also checked the workflow against a second AI's advice and adopted only what fitted the design ([case C6](docs/ai-collaboration.md)).

## Contributing

Branch names, commit messages, naming rules, git hooks and the coverage policy are in [`CONTRIBUTING.md`](CONTRIBUTING.md).
