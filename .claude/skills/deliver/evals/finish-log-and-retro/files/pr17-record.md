# Record of /deliver run for issue #6 -> PR #17 (merged 2026-11-01)

Modes: grill=auto, approve=auto. Issue #6: "Skeleton: validated config, Drizzle migrations, DB readiness, Docker Compose".

## Contract
Contract comment drafted by an agent with three choices; `Chosen: A for all three (vehicle.updated_by NOT NULL; list_price numeric(12,2) CHECK >= 0; vehicle_action.dealership_id plain FK), rest as drafted.` The contract asked for an application-set `updated_at` via Drizzle `$onUpdate`.

## Round 1 findings
1. [code-review r1] minor, apps/api/src/shared/schema.ts:105. Failure: a service test pins Clock and asserts updatedAt -> row holds real now(). Why: `$onUpdate(() => sql`now()`)` reads now inside SQL; CLAUDE.md says now comes from the injected Clock. Fix: drop $onUpdate; each service update sets updatedAt: clock.now().
2. [business-review r1] Spec minor: user_dealership PK named `user_dealership_user_id_dealership_id_pk` (Drizzle default) instead of `user_dealership_pkey` per the contract; the PR listed it as an "implementation note" under "Deviations: None from the spec", and the catalog test baked the odd name in.
3. [business-review r1] Standards minor: vitest.config.ts excludes src/shared/schema.ts from coverage but CONTRIBUTING.md lists only main.ts and *.module.ts.

Implementer round 1 fixed all three in commit 92c22c6 (named PK + test asserting every PK is <table>_pkey; dropped $onUpdate; CONTRIBUTING updated). Issue #6 got `Amended: vehicle.updated_at is set by each service update from the injected Clock, not by Drizzle $onUpdate/DB now(), so tests can pin it.`

## Round 2
[code-review r2] clean. [business-review r2] clean.
[tester r2] pass: 6 criteria against `docker compose up`; two marked "pass (via test)" because not observable through the API (statement_timeout, Clock).

## Afterwards
The four hard-to-reverse decisions from #6 were written as ADRs 0001-0004 in a separate PR (#19) after #17 merged.
