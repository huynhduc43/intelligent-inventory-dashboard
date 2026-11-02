# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Keyloop technical assessment, Scenario B: Intelligent Inventory Dashboard, backend layer. The design is in `docs/research/backend-architecture.md`, extended and superseded by the ADRs in `docs/adr/`; read the relevant section and ADRs before building anything. Decisions are numbered (D1–D19, P1–P3) and the test plan references them. Only the skeleton and tooling exist so far: validated config, the Drizzle schema and migration, `Clock`, the `health` module (`/health/live`, `/health/ready` with a DB ping), the problem+json filter with request IDs and pino logging, Docker Compose, `AgingPolicy` with its unit tests, and auth (login, JWT, dealership guards, permissions, `/me`, `pnpm db:seed`), the vehicle list and detail endpoints (`inventory`, with `AgingPolicy.toStockedOnBounds`), the dashboard endpoint (`dashboard`), the vehicle action endpoints (`actions`: log and history), and the OpenAPI document (`/docs`, committed `docs/api/openapi.json`, `pnpm --filter @inventory/api openapi:export`). Build order is in §4.16.

Conventions (branches, commits, naming, hooks, coverage) are in `CONTRIBUTING.md`.

## Commands

Turborepo + pnpm workspace. Node 24 (`nvm use`); pnpm is pinned via `packageManager`, so use corepack.

```sh
pnpm install                 # also installs husky hooks
pnpm lint | typecheck | test | test:integration | test:cov | build | dev   # turbo, all packages
pnpm format                  # prettier --write .
pnpm --filter @inventory/api exec vitest run test/unit/inventory/aging-policy.spec.ts   # one file
pnpm --filter @inventory/api exec vitest run -t "tierOf"                                 # by test name
```

`test` runs only the unit project. `test:cov` runs every project and enforces 80% global / 100% on `src/modules/*/domain/**`. Integration tests need Docker (Testcontainers).

## Stack

Node 24, TypeScript 6 strict (pinned `~6.0`: typescript-eslint supports only TS < 6.1), NestJS 12 (**ESM**: relative imports need the `.js` suffix), Vitest 4, ESLint 10 flat config (root `eslint.config.mjs`), Prettier. PostgreSQL 17, Drizzle ORM + drizzle-kit (`pnpm --filter @inventory/api db:generate` / `db:migrate`), zod (config and request validation), `nestjs-pino` + `pino-http` (logging), Testcontainers.

## Architecture (modular monolith in `apps/api`)

Modules under `src/modules/`: `auth`, `dealerships`, `inventory`, `actions`, `dashboard`, `health`, plus `src/shared` (config, Drizzle, `Clock`, problem+json filter). Pure rules go in `<module>/domain/`. Rules:

- Only the owning module writes its table. Cross-table reads are read-only SQL, only where the design names them: `dashboard`, `inventory` list/detail → latest action (ADR 0011), and `actions` log → vehicle status (ADR 0013). No dependency cycles.
- Five tables: `dealership`, `app_user`, `user_dealership`, `vehicle`, `vehicle_action`. `dealership_id` is on every row and every query.

## Invariants that are easy to get wrong

- **Aging is derived, never stored.** Age = `today_local − stocked_on` (a `date` column). No tier flag, no nightly job.
- **Time zones are computed only in Postgres** (`now() AT TIME ZONE d.timezone`). Node never does time-zone maths. `now` comes from the injected `Clock` and is passed into SQL as a parameter so tests can pin it.
- **`AgingPolicy`** (`inventory/domain/aging-policy.ts`) is pure TS: `tierOf`, `bucketOf`, later `validateThresholds`, `toStockedOnBounds`. Tier/age filters become `stocked_on` bounds before reaching SQL. Tiers: `FRESH` < watch ≤ `WATCH` ≤ aging < `AGING` (defaults 60/90, per dealership). Buckets (0–30, 31–60, 61–90, 90+) are fixed and independent of thresholds.
- **Race-free writes via conditional SQL, not locks:** status changes are `UPDATE … WHERE status = ANY($allowedFrom)`; action logging is `INSERT … SELECT … WHERE status = 'IN_STOCK'`. 0 rows → re-read: missing → 404, else 409.
- **Actions are append-only;** the newest by `id` is current. Never update or delete them.
- **Lifecycle:** `IN_STOCK ⇄ RESERVED`, either → `SOLD` (terminal, sets `sold_at`). Same-state transitions are 409.
- **Auth:** guards check **permissions** (`@RequirePermission`), never role names. Role→permission map is a frozen constant in `auth/domain/permissions.ts`. No roles in the JWT; `DealershipGuard` re-reads membership, user status and thresholds on every request in one query.
- **Non-members get 404, not 403** (don't reveal that a dealership exists). Members lacking a permission get 403.
- **Errors are RFC 9457 problem+json** from one exception filter; `instance` is the request ID that also appears on the log line.
- KPIs (dashboard) count `IN_STOCK` only. "Aging with no action" means no action ever logged (`MONITOR` counts as an action).

## Out of scope for the MVP

Everything in §6 (refresh tokens, ETag/304, keyset pagination, CSV import, If-Match, audit table, OTel, etc.) is deliberately deferred with a stated trigger. Don't build it unless asked; mark deliberate shortcuts in code with a `shortcut:` comment (e.g. the in-memory login throttler).

## Agent workflow

Branch, commit and PR rules are in `CONTRIBUTING.md`. On top of those:

- **Worktree per piece of work**, from the first edit: `git fetch origin && git worktree add ../intelligent-inventory-dashboard-<issue>-<topic> -b <branch> origin/dev` (drop `<issue>` if there is none; the local `dev` is not kept up to date). A parallel session can switch the shared checkout's branch. Check the current branch immediately before every commit.
- Once the work is done and `pnpm verify` passes, commit, push and open the PR without waiting to be asked. After every push, `gh pr checks <P> --watch`; on a red check read `gh run view <run> --log-failed`, fix it and push again. A PR is not done, and is not reported as done, until its checks are green. Merge only when the user says so, and then merge immediately without waiting for CI unless told to. After the merge, `git worktree remove <path>` and `git branch -d <branch>`; if the worktree still has uncommitted or unpushed work, leave it and say so.
- Never create a GitHub issue without asking first. Once agreed, pick the title yourself.
- **Steps outside the repo** (see `CONTRIBUTING.md`): a change is not done until the step is in `docs/environment-setup.md` and the final reply tells the user which steps remain and in which environment.
- **Docs move with the code, in the same PR** (the PR's **Doc impact**, `CONTRIBUTING.md`). `docs/research/backend-architecture.md` is frozen research: D1–D19 and P1–P3 are accepted decisions, and the only edit allowed is marking one superseded, with a link to its ADR. A new or changed decision is an ADR in `docs/adr/`, listed in its README. `docs/system-design.md`, `docs/diagrams/` and the **Status** lines in this file and README.md describe the system as it is now. A moment that shows how the AI was directed or corrected goes in `docs/ai-collaboration.md`.
- **Changing `/deliver` or its agents:** rerun the cases in `.claude/skills/deliver/evals/` against the frozen baseline in `.claude/evals/deliver/skill-snapshot/` (method and last results: `.claude/evals/deliver/REPORT.md`) and put the comparison in the PR, unless the user waives the rerun; then the PR says so.
- **Tests and dependencies:** never weaken, skip or delete a test to make code pass. Ask before adding a dependency.
- **Reading code:** prefer Serena's symbol tools (`get_symbols_overview`, `find_symbol`, `find_referencing_symbols`) over reading whole files. Find every caller before changing a signature. Plain text search is fine for strings, config keys and docs.
- **Transactions (Drizzle):** inside `db.transaction(async (tx) => …)` every statement goes through `tx`, never `db` (it can deadlock on the held lock). One service method = one transaction; callers never wrap service calls in a transaction. New transaction logic gets an integration test against Testcontainers Postgres with a short timeout so a hang fails fast. Prefer the conditional-SQL writes above over transactions where they suffice.
- **Communication:** reply in the user's language; code, comments and docs stay in English. For decisions that are the user's, number each question, label options A, B, C and name your recommendation. No features, abstractions or error handling beyond the request; mention unrelated dead code instead of deleting it.

## Agent skills

### Issue tracker

GitHub Issues on `huynhduc43/intelligent-inventory-dashboard`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.
