# Findings: business review r1 (PR closing #11), dry run

Each block is one comment I would have posted, in posting order. Inline comments name the file and line on the PR head; PR-level comments have no site.

---

## F1 (inline: apps/api/src/modules/actions/actions.service.ts:14)

```
[business-review r1] Spec · blocker
Sites: apps/api/src/modules/actions/actions.service.ts:14
Gap: Actions may be logged only on an `IN_STOCK` vehicle, and a `RESERVED` vehicle must get 409. The conditional insert uses `AND v.status IN ('IN_STOCK', 'RESERVED')`, so a RESERVED vehicle gets 201 and an action row. The PR's **Deviations** says "None", and neither `## Decisions` nor any `Amended:` comment records this change.
Source: #11 acceptance criterion 2 ("`RESERVED` or `SOLD` vehicle -> 409 `VEHICLE_NOT_IN_STOCK`"); #11 Decision 1 (`INSERT ... SELECT ... WHERE status = 'IN_STOCK'`); D5; P2; architecture doc §4.5 ("Actions only on `IN_STOCK`"); CLAUDE.md invariant "action logging is `INSERT … SELECT … WHERE status = 'IN_STOCK'`"
Fix: Change the predicate to `AND v.status = 'IN_STOCK'`. If RESERVED vehicles really should take actions, record it as a decision on #11 and add an ADR in this PR that supersedes D5 (CLAUDE.md, Agent workflow, docs rule). Either way, add the D5 integration test (RESERVED → 409, SOLD → 409, FRESH IN_STOCK → 201).
```

---

## F2 (inline: apps/api/src/modules/actions/actions.controller.ts:19)

```
[business-review r1] Spec · blocker
Sites: apps/api/src/modules/actions/actions.controller.ts:19
Gap: A non-member must get 404, the same as a missing dealership, and membership is decided by `DealershipGuard`, which re-reads it from the DB on every request. The POST handler adds its own check, `if (!req.user.dealershipIds.includes(d)) throw new ForbiddenException({ code: 'FORBIDDEN' })`. That returns 403 to non-members, which confirms that the dealership exists. It also relies on a `dealershipIds` list on the token user, and the JWT carries no memberships (its claims are only `iss`, `aud`, `sub`, `iat`, `exp`), so a revoked membership would still pass until the token expires. The check is only on POST, so the GET and POST handlers disagree.
Source: #11 acceptance criterion 3 ("Non-member -> 404"); D16; architecture doc §4.6 (guard chain: context query no row → 404; "No roles in the token"); CLAUDE.md invariants ("Non-members get 404, not 403"; "`DealershipGuard` re-reads membership … on every request")
Fix: Delete line 19 and the now-unused `ForbiddenException` import. Rely on `DealershipGuard` (404 for a non-member, 403 for a missing permission). Cover it with the D15/D16 route × role integration test.
```

---

## F3 (inline: apps/api/src/shared/config.ts:15)

```
[business-review r1] Spec · blocker
Sites: apps/api/src/shared/config.ts:15, apps/api/src/modules/actions/log-action.dto.ts:6
Gap: #11 says "No new configuration" and fixes the note limit at 1,000 characters. The PR adds `ACTION_NOTE_MAX_LENGTH` as a required env var with no default, so any environment that does not set it, including the current Docker Compose file and `.env.example`, now fails config validation at startup. The DTO also bypasses the validated config: it reads `Number(process.env.ACTION_NOTE_MAX_LENGTH)` when the decorator is evaluated, so if that runs before the variable is set, the limit becomes `NaN` and every note is rejected. This is a step outside the repo, but it appears neither in `docs/environment-setup.md` nor under the PR's **Manual steps** (which says "None"), and §4.13 does not list it.
Source: #11 Decision 2 ("Note at most 1,000 characters (D4), validated by the DTO") and Decision 3 ("No new configuration"); D4; architecture doc §4.13; CONTRIBUTING.md, Pull requests (steps outside the repo go in `docs/environment-setup.md` and **Manual steps**); CLAUDE.md, Agent workflow (Steps outside the repo)
Fix: Remove the `ACTION_NOTE_MAX_LENGTH` line from `config.ts` and use a constant in the DTO: `@MaxLength(1000)`, or a named `NOTE_MAX_LENGTH = 1000` next to `ACTION_TYPES`. If the limit really must be configurable, first amend #11's Decisions and supersede D4 with an ADR. Then give the variable a default of 1000, read it through `APP_CONFIG`, and add it to `docs/environment-setup.md`, `apps/api/.env.example`, `docker-compose.yml` (if it is required) and the PR's **Manual steps**.
```

---

## F4 (inline: apps/api/src/modules/actions/actions.service.ts:19)

```
[business-review r1] Spec · major
Sites: apps/api/src/modules/actions/actions.service.ts:19
Gap: The chosen contract's 409 code is `VEHICLE_NOT_IN_STOCK`. The service throws `ConflictException({ code: 'NOT_IN_STOCK' })`, so clients that match on the contract's code will miss it.
Source: #11 `Contract` comment ("409 VEHICLE_NOT_IN_STOCK") with `Chosen: as drafted`; #11 acceptance criterion 2; architecture doc §4.7 (POST actions row) and §4.8; docs/system-design.md §3.4
Fix: Throw `{ code: 'VEHICLE_NOT_IN_STOCK' }`, and assert the problem+json `code` (not only the status) in the D5 integration test.
```

---

## F5 (inline: apps/api/src/modules/actions/actions.controller.ts:20)

```
[business-review r1] Spec · major
Sites: apps/api/src/modules/actions/actions.controller.ts:20
Gap: A successful POST must return 201 with a `Location` header pointing at the new action. The handler returns the inserted row and never sets `Location`.
Source: #11 acceptance criterion 1 ("-> 201 + `Location`"); architecture doc §4.7 (POST actions: "→ action, `Location`")
Fix: Set `Location: /api/v1/dealerships/{d}/vehicles/{v}/actions/{id}` on the 201 response, for example with `@Res({ passthrough: true })` and `res.location(...)`, and assert the header in the integration test.
```

---

## F6 (inline: apps/api/src/modules/actions/actions.service.ts:15)

```
[business-review r1] Standards · major
Sites: apps/api/src/modules/actions/actions.service.ts:15, apps/api/src/modules/actions/actions.service.ts:16
Gap: JSON fields are camelCase. `log` returns `res.rows[0]` from a raw `RETURNING *`, which carries snake_case column names (`dealership_id`, `vehicle_id`, `action_type`, `created_by`, `created_at`). `list` goes through Drizzle's `select()` and returns camelCase, so the same action resource has two shapes depending on the endpoint.
Source: CONTRIBUTING.md, Naming ("JSON fields, query params: camelCase"); architecture doc §4.7 (POST returns "action", the same resource that GET lists)
Fix: Make both endpoints return one action shape in camelCase. Either alias the columns in `RETURNING` (`id, vehicle_id AS "vehicleId", action_type AS "actionType", note, created_by AS "createdBy", created_at AS "createdAt"`) or map both results through one function.
```

---

## F7 (inline: apps/api/src/modules/actions/actions.service.ts:2)

```
[business-review r1] Spec · minor
Sites: apps/api/src/modules/actions/actions.service.ts:2
Gap: The contract lists 404 for `GET .../vehicles/{v}/actions`, and §4.8 defines 404 `NOT_FOUND` as a "missing resource or not a member". `list` queries only `vehicle_action`, so for a vehicle that does not exist, or one in another dealership, it returns `200 {items: []}` instead of 404. POST, by contrast, re-reads the vehicle and returns 404.
Source: #11 `Contract` comment ("GET: 200 {items}, 403, 404"); architecture doc §4.7 (GET actions: 200, 404) and §4.8
Fix: When `list` returns no rows, check `vehicleExists(ctx, vehicleId)` and throw `NotFoundException({ code: 'NOT_FOUND' })` when the vehicle is missing, as `log` already does.
```

---

## F8 (PR-level)

```
[business-review r1] Spec · blocker
Gap: The issue adds three §4.15 test rows at integration level. None of them is in the diff, which adds no test file. The PR's **Evidence** table cites four tests in `actions.spec.ts` ("logs an action", "rejects a sold vehicle", "forbids outsiders", "lists newest first"), but no such file exists in the PR or on `origin/dev`. Even as named, the cited tests leave gaps. There is no RESERVED → 409 test, which is the case F1 gets wrong. "forbids outsiders" suggests a 403 for non-members, which F2 gets wrong. Nothing covers missing vehicle → 404, VIEWER → 403, the `Location` header, or the note-length 400.
Source: architecture doc §4.15 rows "D4/P3 actions: latest is current; two concurrent posts both persist (integration)", "D5 eligibility: RESERVED/SOLD → 409; FRESH in-stock → 201 (integration)" and "D15/D16 RBAC + tenancy: every route × every role; non-member → 404 with the same body as a missing dealership (integration)"; #11 acceptance criteria 1–4; CONTRIBUTING.md, Tests and coverage (80% gate)
Fix: Add `apps/api/test/integration/actions.spec.ts` against Testcontainers Postgres. It should cover: 201 with `Location` on IN_STOCK (FRESH); 409 `VEHICLE_NOT_IN_STOCK` for RESERVED and for SOLD; 404 `NOT_FOUND` for a missing vehicle; 400 `VALIDATION_FAILED` for a 1,001-character note and for an unknown `actionType`; GET newest first by `id`; two concurrent POSTs that both persist, with the newer one current; and the two actions routes added to the route × role table (ADMIN, MANAGER, VIEWER, non-member → 404). Then update **Evidence** so each criterion points at a test that exists.
```

---

## F9 (PR-level)

```
[business-review r1] Spec · minor
Gap: The docs must move with the code in the same PR, and the PR body must have a **Doc impact** section. This PR adds the `actions` module, its first endpoints, an env var and new error codes. The body has no **Doc impact** section, and the diff updates none of the docs that describe the system as it is now. The **Status** lines in CLAUDE.md and README.md, and the "Status:" line in docs/system-design.md ("Today the repo has the skeleton, the `health` module and `AgingPolicy`…"), still describe a repo without actions.
Source: CONTRIBUTING.md, Pull requests ("Under **Doc impact**, list each doc the change updates … or `none` with the reason"; the **Status** in README.md and CLAUDE.md); CLAUDE.md, Agent workflow ("Docs move with the code, in the same PR")
Fix: Add a **Doc impact** section to the PR body. Update the Status lines in CLAUDE.md, README.md and docs/system-design.md to include the actions module (log and list). If F3 is resolved by keeping the variable, also list docs/environment-setup.md and the ADR there. docs/system-design.md §2.1 and §3.4 already describe the intended behaviour, so they need no change once F1 and F4 are fixed.
```
