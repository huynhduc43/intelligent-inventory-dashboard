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

The quickest run is Docker Compose: Postgres, migrations, then the API on port 3000. The second command adds the demo users, vehicles and action history, and prints the users' passwords once:

```sh
docker compose up --build -d
docker compose run --rm migrate node db/seed.ts
```

To develop with Node on the host:

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

Production build (Node does not read `.env` by itself, so pass it, or set `DATABASE_URL` and `JWT_SECRET` in the environment):

```sh
pnpm build
node --env-file=apps/api/.env apps/api/dist/main.js
```

## Testing

```sh
pnpm test               # unit tests, no I/O
pnpm test:integration   # against a real PostgreSQL 17 in a throwaway container (Testcontainers; needs Docker running)
pnpm test:cov           # every test with coverage; fails under 80% globally or 100% on src/modules/*/domain/**
pnpm verify             # what CI runs: frozen install, format check, lint, typecheck, test:cov (needs Docker)
```

Run one test file or test by name:

```sh
pnpm --filter @inventory/api exec vitest run test/unit/inventory/aging-policy.spec.ts
pnpm --filter @inventory/api exec vitest run -t "tierOf"
```

For an end-to-end check against the running API, use the curl script in [Getting started](#getting-started).

## Scripts

Run from the repo root; Turborepo runs them in every workspace package. Test scripts are in [Testing](#testing).

| Command          | Does                          |
| ---------------- | ----------------------------- |
| `pnpm dev`       | Start the API in watch mode   |
| `pnpm build`     | Compile to `apps/api/dist`    |
| `pnpm lint`      | ESLint, zero warnings allowed |
| `pnpm typecheck` | `tsc --noEmit`                |
| `pnpm format`    | Prettier                      |

## Performance evidence

Target (§1.4): the dashboard and a 50-row list page answer in p95 ≤ 300 ms at 2,000 in-stock vehicles. The plans below are at **8× that size**: `SEED_VEHICLES_PER_DEALERSHIP=20000`, which is about 16,000 in-stock vehicles per dealership (60,003 vehicles and about 19,000 actions over the three seeded dealerships). The list page runs in 39 ms and the dashboard request (its three statements) in about 46 ms in total, so both targets hold with a wide margin.

| Case                                        | Plan                                                         | Execution |
| ------------------------------------------- | ------------------------------------------------------------ | --------- |
| List, default (in stock, oldest, limit 50)  | Seq Scan on `vehicle`, latest-action index lookup per row    | 39 ms     |
| List, `tier=AGING`                          | Seq Scan, same shape                                         | 22 ms     |
| List, `make=Ford&model=Focus`               | Index Scan on `vehicle_dealership_make_model_idx`            | 7 ms      |
| List, `tier=AGING&hasAction=false`          | Seq Scan, same shape                                         | 18 ms     |
| Dashboard, KPIs and age buckets             | Bitmap Index Scan on `vehicle_dealership_status_stocked_idx` | 20 ms     |
| Dashboard, make and model                   | Bitmap Index Scan on `vehicle_dealership_status_stocked_idx` | 5 ms      |
| Dashboard, current-action counts            | Bitmap Index Scan, then latest-action index lookup per row   | 21 ms     |
| **Dashboard request, total (3 statements)** |                                                              | **46 ms** |

How to reproduce it, how to read the plans and the full `db:explain` output: [`docs/performance.md`](docs/performance.md).

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

The code, tests and docs here were written by an AI agent (Claude Code, Claude Opus) that I directed. I owned the design, the workflow the agents follow and every change to it, and the verification; agents wrote the code and other agents checked it. The evidence, 49 cases with links, is in [`docs/ai-collaboration.md`](docs/ai-collaboration.md).

### Strategy for guiding the AI

Decide first, then let the agent build inside the decisions.

- **Design before code.** The agent researched primary sources and drafted the design ([`backend-architecture.md`](docs/research/backend-architecture.md)). Every decision is numbered and marked as mine (**U**, 14 of 19) or the agent's assumption (**A**, 5), and the assumptions are listed in the System Design Document. Later decisions are ADRs.
- **Rules the agent can't miss.** `CLAUDE.md` holds the invariants that are easy to get wrong (aging is derived, time zones only in Postgres, race-free conditional writes, 404 for non-members, append-only actions), so every session and every agent starts from them.
- **One requirement at a time, through fixed roles.** I built the `/deliver` skill (`.claude/skills/deliver/`), which takes one issue through analyst, architect, contract, implementer, code reviewer, business reviewer and tester. Its gates can stop for my approval (`grill=manual`, `approve=manual`) or let the agent take its own recommendation (`auto`). Inside the design, the builds ran in `auto`: the agent picked implementation details and contract options, and the independent reviewers below were the check. What stayed with me: the design, every change to how the agents work, the decisions after each evaluation, and every merge. When an agent hits a choice the spec doesn't settle, or a conflict with the design, it stops for me instead of guessing.

### Verifying and refining its output

The author never approves its own work.

- Reviewers and the tester are separate agents, spawned fresh with only the PR and the issue. They treat the author's description and passing tests as claims to check. The code reviewer hunts defects and over-engineering; the business reviewer checks the PR against the issue, the contract, the design and the docs; the tester runs the API on a real Postgres and walks each acceptance criterion with `curl`.
- Findings go back to a fresh implementer, and the next review looks only at the fixes, for at most three rounds before I'm asked.
- **What it caught.** On the first feature (#17), the reviewers found three problems the implementer's own tests passed: a Drizzle `$onUpdate` timestamp that bypassed the injected `Clock` (now [ADR 0002](docs/adr/0002-updated-at-set-from-clock.md)), a primary key name that differed from the agreed contract while the PR claimed "no deviations", and a coverage exclusion the documented standard didn't allow. All three were fixed in one round.

**Refining the workflow itself.** `/deliver` is not a fixed prompt: I kept correcting it when it failed.

- **A retro after every PR, approved by me.** The agent proposes changes to its own instructions and checks; I apply, change or skip each one (C11: three applied, one skipped as not worth its cost).
- **Hands-on fixes when the workflow went wrong.** Agents had merged four PRs onto a red `dev` without reading CI. I had `pnpm verify` start with the same frozen install as CI, and a PR now counts as done only when its checks are green (C23). An implementer once reported `pnpm verify` green while it had failed; its evidence must now include the command's output (C12).
- **Mechanisms over reminders.** When three mistakes that had been fixed came back, I asked for a root-cause diagnosis: each earlier fix was a sentence in the prompt of the agent that broke the rule, and nothing failed when it skipped it. They became a script (`check-evidence.mjs`), a test helper and an orchestrator step (C39).
- **Skill changes measured, not assumed.** I ran a `/deliver` change through `skill-creator` evals against a frozen copy of the old skill: 6 steps, 46 assertions, **94%** for the new skill against 68% for the old one and 85% with its sub-skills removed ([report](.claude/evals/deliver/REPORT.md)). It ran once, because each run costs many tokens; the limits are under [Known issues](#known-issues-and-limits).
- I also checked the workflow against a second AI's advice and adopted only what fitted the design (C6).

### Ensuring the final quality of the code

- **Machines check what they can:** strict TypeScript, ESLint with zero warnings, Prettier, commitlint and branch-name hooks, CI, and a coverage gate (80% global, 100% on the pure domain rules). Integration tests run against real Postgres (Testcontainers), because the rules under test are SQL date maths and constraints.
- **Docs move with the code.** Each PR lists its **Doc impact** (design doc, diagrams, ADRs, Status), and the business reviewer treats a missing update as a finding.
- **The AI's mistakes are on record.** The log keeps the cases where the agent was wrong, not only where it was right: a "verify passed" that had failed (C12), a PR-body edit it reported but never made (C20), tests that could not fail (C34, C37).

## Known issues and limits

**Product**

- **Deferred by design.** Refresh tokens, ETag/304, keyset pagination, CSV import, `If-Match`, an audit table and OpenTelemetry are out of the MVP, each with the trigger that would bring it in ([§6](docs/research/backend-architecture.md#6-alternatives-and-when-wed-use-them)).
- **Shortcuts marked in code** (`shortcut:` comments):
  - the login throttler keeps its counts in memory, per process ([`auth.controller.ts`](apps/api/src/modules/auth/auth.controller.ts));
  - a vehicle's action history is returned whole, without paging ([`actions.service.ts`](apps/api/src/modules/actions/actions.service.ts));
  - problem+json `type` URIs use a placeholder domain ([`problem.ts`](apps/api/src/shared/problem.ts));
  - an idle Postgres client's error is swallowed, not logged ([`db.ts`](apps/api/src/shared/db.ts)). Its comment says "once pino lands", but pino has landed, so the comment is out of date.
- **Query plans not tuned.** With the demo seed the list query picks a Seq Scan, and PostgreSQL's JIT adds 5–10 ms to three statements; both are inside the target ([`docs/performance.md`](docs/performance.md)).

**AI process**

- **The `/deliver` evaluation ran once**, so there is no variance estimate.
- **Later skill changes are not re-measured.** The three fixes made after that evaluation (stop on any conflict with the design, acceptance criteria in the spec, the Contract role reads the invariants), and the later retro changes, have not been through a second evaluation; I waived the rerun for cost each time (e.g. C11, C23, C39).
- **One evaluation finding is still open:** at spec time the agent adds decisions the grill did not settle, instead of asking. The finish fixture and the implementer's scope assertion also need fixing before the next evaluation.

## Contributing

Branch names, commit messages, naming rules, git hooks and the coverage policy are in [`CONTRIBUTING.md`](CONTRIBUTING.md).
