# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Keyloop technical assessment, Scenario B: Intelligent Inventory Dashboard, backend layer. The design is in `docs/research/backend-architecture.md`; read the relevant section before building anything. Decisions are numbered (D1–D19, P1–P3) and the test plan references them. Only the skeleton and tooling exist so far: the `health` module (`/health/live`, `/health/ready` via Terminus; readiness gets the DB ping in build step 1) and `AgingPolicy` with its unit tests. Build order is in §4.16.

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

Node 24, TypeScript 6 strict (pinned `~6.0`: typescript-eslint supports only TS < 6.1), NestJS 12 (**ESM**: relative imports need the `.js` suffix), Vitest 4, ESLint 10 flat config (root `eslint.config.mjs`), Prettier. Planned: PostgreSQL, Drizzle ORM + drizzle-kit, `nestjs-pino`, Testcontainers.

## Architecture (modular monolith in `apps/api`)

Modules under `src/modules/`: `auth`, `dealerships`, `inventory`, `actions`, `dashboard`, `health`, plus `src/shared` (config, Drizzle, `Clock`, problem+json filter). Pure rules go in `<module>/domain/`. Rules:

- Only the owning module writes its table. `dashboard` is the only module that reads across tables (read-only SQL). No dependency cycles.
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

## Agent skills

### Issue tracker

GitHub Issues on `huynhduc43/intelligent-inventory-dashboard`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.
