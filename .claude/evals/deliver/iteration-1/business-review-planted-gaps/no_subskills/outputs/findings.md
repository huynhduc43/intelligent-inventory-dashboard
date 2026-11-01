# Findings: business review, round 1 (dry run)

In a live run, each block below would be one PR comment, posted in this order. A finding with a code site goes inline on its first site (`gh api repos/{owner}/{repo}/pulls/<pr>/comments … -f path=<first site> -F line=<line> -f side=RIGHT`). A finding without one goes PR-level (`gh pr comment`). Line numbers are those of the new file as `pr.diff` shows it. `actions.service.ts` is elided in the diff (`// ... imports`), so its numbers count from the first line the diff shows. No earlier `[business-review …]` or `[code-review …]` comments exist (round 1, no `since`), so nothing was dropped as a duplicate.

---

## F1 (inline on `apps/api/src/modules/actions/actions.service.ts:14`)

```
[business-review r1] Spec · blocker
Sites: apps/api/src/modules/actions/actions.service.ts:14
Gap: Actions may be logged only on an `IN_STOCK` vehicle, and `RESERVED` or `SOLD` must get 409 → the conditional insert matches `v.status IN ('IN_STOCK', 'RESERVED')`, so a `RESERVED` vehicle gets a 201 and a new action row. The PR's **Deviations** says "None", and the issue's `## Decisions` records no change.
Source: issue #11 acceptance criterion 2 ("`RESERVED` or `SOLD` vehicle -> 409 `VEHICLE_NOT_IN_STOCK`") and Decision 1 (`INSERT ... SELECT ... WHERE status = 'IN_STOCK'`); D5; P2 ("Logging an action uses the same pattern … `status = 'IN_STOCK'`"); §4.9 "Logging an action"; CLAUDE.md invariant "Race-free writes via conditional SQL".
Fix: Change the predicate to `AND v.status = 'IN_STOCK'`, and add the D5 integration test that a `RESERVED` vehicle gets 409 (see F8). If allowing `RESERVED` is intended, record it in `## Decisions` with an `Amended:` comment, and add an ADR in this PR that supersedes D5.
```

## F2 (inline on `apps/api/src/modules/actions/actions.controller.ts:19`)

```
[business-review r1] Spec · blocker
Sites: apps/api/src/modules/actions/actions.controller.ts:19
Gap: A non-member must get 404, not 403, and membership must be re-read from the database on every request by `DealershipGuard` → the POST handler does its own check against `req.user.dealershipIds` (membership taken from the JWT) and throws `ForbiddenException` (403 `FORBIDDEN`). That tells a non-member the dealership exists, trusts membership that can be stale for up to the token's 1 h lifetime, and runs on POST only, so the two routes behave differently.
Source: issue #11 acceptance criterion 3 ("Non-member -> 404"); D16; §4.6 "Guard chain" and "Why `404` for non-members"; CLAUDE.md invariants "Non-members get 404, not 403" and "No roles in the JWT; `DealershipGuard` re-reads membership … on every request".
Fix: Delete line 19 (and the then-unused `d` param and `ForbiddenException` import). Let `JwtAuthGuard` → `DealershipGuard` + `@RequirePermission` decide: no membership row → 404 `NOT_FOUND`, member without the permission → 403 `FORBIDDEN`. Cover both routes in the D15/D16 route × role test (F8).
```

## F3 (inline on `apps/api/src/modules/actions/actions.service.ts:19`)

```
[business-review r1] Spec · major
Sites: apps/api/src/modules/actions/actions.service.ts:19
Gap: The chosen contract's conflict code is `409 VEHICLE_NOT_IN_STOCK` → the service throws `ConflictException({ code: 'NOT_IN_STOCK' })`, so clients get a code the contract does not define.
Source: issue #11 `Contract` comment (POST errors: "409 VEHICLE_NOT_IN_STOCK") and `Chosen: as drafted`; acceptance criterion 2; §4.7 (POST …/actions row); §4.9 "Logging an action".
Fix: Use `code: 'VEHICLE_NOT_IN_STOCK'`, and assert the `code` field in the D5 integration test.
```

## F4 (inline on `apps/api/src/modules/actions/actions.service.ts:2`)

```
[business-review r1] Spec · major
Sites: apps/api/src/modules/actions/actions.service.ts:2, apps/api/src/modules/actions/actions.controller.ts:13
Gap: `GET …/vehicles/{v}/actions` must return 404 for a vehicle that does not exist in the dealership → `list` filters `vehicle_action` only, so a missing vehicle, or one that belongs to another dealership, returns `200 {items: []}`, which looks the same as a vehicle with no history.
Source: issue #11 `Contract` comment ("GET: 200 {items}, 403, 404"); §4.7 (GET …/actions: 200, 404); §4.8 ("`404 NOT_FOUND` (missing resource or not a member)").
Fix: When the list is empty, check that the vehicle exists in `ctx.dealershipId` (reuse `vehicleExists`), and throw `NotFoundException({ code: 'NOT_FOUND' })` if it does not. Add an integration test for a missing vehicle and for another dealership's vehicle.
```

## F5 (inline on `apps/api/src/modules/actions/actions.controller.ts:16`)

```
[business-review r1] Spec · major
Sites: apps/api/src/modules/actions/actions.controller.ts:16
Gap: Logging an action must answer 201 with a `Location` header → the POST handler returns the row and never sets `Location`. Nest's default 201 is sent without the header.
Source: issue #11 acceptance criterion 1 ("-> 201 + `Location`"); §4.7 (POST …/actions: "→ action, `Location`").
Fix: Set `Location` to the new action's URI (for example `/api/v1/dealerships/{d}/vehicles/{v}/actions/{id}`) through `@Res({ passthrough: true })` or `@Header`, and assert the status and the header in the "logs an action" test.
```

## F6 (inline on `apps/api/src/modules/actions/actions.service.ts:15`)

```
[business-review r1] Standards · major
Sites: apps/api/src/modules/actions/actions.service.ts:15, apps/api/src/modules/actions/actions.service.ts:16
Gap: JSON fields are camelCase, and the POST response is the same action shape the GET list returns → `log` returns the raw `RETURNING *` row from `db.execute`, whose keys are the column names (`dealership_id`, `vehicle_id`, `action_type`, `created_by`, `created_at`). The GET list goes through Drizzle `select()` and returns camelCase, so one resource comes back in two shapes.
Source: CONTRIBUTING.md **Naming** ("JSON fields, query params | camelCase"); §4.7 (POST → action; GET → `{items[...]}` of the same resource); the `Contract` comment shapes.
Fix: Return camelCase from `log`: map the returned row to the same DTO the list uses, or write the conditional insert with Drizzle (`db.insert(vehicleAction).select(…)`) and `.returning()` so both routes share the schema's field names. Assert the response body's field names in the test.
```

## F7 (inline on `apps/api/src/shared/config.ts:15`)

```
[business-review r1] Spec · major
Sites: apps/api/src/shared/config.ts:15, apps/api/src/modules/actions/log-action.dto.ts:6
Gap: The note is at most 1,000 characters, validated by the DTO, and the issue adds no configuration → the PR adds a new env var `ACTION_NOTE_MAX_LENGTH`. The var is required and has no default, so every existing environment (local `.env`, Docker Compose, CI, Testcontainers tests) fails at startup until it is set. The DTO also reads `process.env` directly at decoration time, bypassing the validated config, so an unset var gives `MaxLength(NaN)`, and the DB `CHECK char_length(note) <= 1000` stays at 1,000 whatever the var says. The var is also missing from `docs/environment-setup.md`, `apps/api/.env.example` and §4.13. The PR's **Manual steps** and **Deviations** both say "None".
Source: issue #11 `## Decisions` 2 ("Note at most 1,000 characters (D4), validated by the DTO") and 3 ("No new configuration"); D4; §4.13; CONTRIBUTING.md **Pull requests** (an outside-the-repo step goes in `docs/environment-setup.md` and **Manual steps**); CLAUDE.md **Agent workflow** "Steps outside the repo".
Fix: Build the spec: delete `ACTION_NOTE_MAX_LENGTH` from `config.ts` and use `@MaxLength(1000)` (or a shared constant that matches the DB CHECK) in the DTO. If a configurable limit is really wanted, record it in `## Decisions` with an `Amended:` comment and an ADR that supersedes D4's note length, give it a default of 1000, read it from the validated config instead of `process.env`, keep it ≤ the DB CHECK, and add it to `docs/environment-setup.md`, `.env.example` and the PR's **Manual steps**.
```

## F8 (PR-level, no single code site)

```
[business-review r1] Spec · blocker
Gap: Each §4.15 row this issue touches needs a test at the level the row names, and the PR's **Evidence** must map each acceptance criterion to a real test → the diff adds no test file at all, yet **Evidence** cites four tests in `actions.spec.ts`. The following are missing:
  - D5 eligibility (integration): RESERVED → 409 `VEHICLE_NOT_IN_STOCK`, SOLD → 409, FRESH in-stock → 201. Evidence names only "rejects a sold vehicle", so the RESERVED case (broken, F1) is untested.
  - D4/P3 actions (integration): latest is current, and two concurrent posts both persist.
  - D15/D16 RBAC + tenancy (integration, table-driven route × role): non-member → 404 with the same body as a missing dealership, and VIEWER → 403 on POST. Evidence calls it "forbids outsiders", which asserts the wrong status (F2).
  - Acceptance criterion 2, missing vehicle → 404 `NOT_FOUND`: no Evidence row at all.
  - Contract statuses with no test: POST 400 `VALIDATION_FAILED` (bad `actionType`, note > 1,000 chars, unknown field) and GET 404 (F4).
Source: §4.15 rows "D4/P3 actions", "D5 eligibility", "D15/D16 RBAC + tenancy"; issue #11 acceptance criteria 1–4 and `Contract` comment; /deliver role 4 **Done** (Evidence maps each criterion to its test); CLAUDE.md "never weaken, skip or delete a test".
Fix: Add `apps/api/test/integration/actions.spec.ts` (Testcontainers) with the cases above, add the actions routes to the route × role table, and update **Evidence** so each criterion names a test that exists in the diff, with its output.
```

## F9 (PR-level, no single code site)

```
[business-review r1] Spec · minor
Sites: CLAUDE.md:7, README.md:11, docs/system-design.md:5
Gap: A PR that adds a component lists its doc changes under **Doc impact** and updates the **Status** lines → the PR body has no **Doc impact** section, and the diff touches no doc. After this PR the `actions` module and its two endpoints exist, but the Status lines still say only the skeleton, `health` and `AgingPolicy` exist (CLAUDE.md: "Only the skeleton and tooling exist so far"; README: "the database, auth and the inventory endpoints follow"; system-design.md: "Today the repo has the skeleton, the `health` module and `AgingPolicy`").
Source: CONTRIBUTING.md **Pull requests** (**Doc impact** checklist: system-design.md section, diagrams, ADRs, GLOSSARY.md, Status in README.md and CLAUDE.md); CLAUDE.md **Agent workflow** "Docs move with the code, in the same PR".
Fix: Add a **Doc impact** section to the PR body and update the three Status lines to say the actions endpoints are built. If F1 or F7 ends with a recorded decision instead of a code fix, list its ADR there too.
```
