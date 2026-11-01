## Problem Statement

Managers log actions against aging vehicles (price reduction planned, transfer, auction, and so on), often with a short note. Sometimes the note has a typo: a wrong price, a misspelt dealership in a transfer, a missing word. Actions are append-only, so today there is no way to fix it. The wrong note stays on the vehicle's current action, and every colleague and viewer reads it on the vehicle list, the vehicle detail and the action history.

## Solution

The manager who logged an action can correct its note for 15 minutes after logging it. The correction is logged as a new action that points at the one it corrects and carries the same action type with the fixed note. The original stays in the history unchanged, so nothing is lost and the audit trail (who wrote what, when) stays complete. Because the newest action is the current one, the corrected note is what everyone sees from then on.

After 15 minutes, or once someone else has logged a newer action on the vehicle, or once the vehicle is no longer in stock, the note can no longer be corrected; the manager logs a new action instead.

## Decisions

Settled by the grill:

1. Actions stay append-only (D4). A note fix is a new `vehicle_action` row with `corrects_action_id` pointing at the original; the original row is never updated. The newest row by `id` is the current action.
2. The fix is allowed only while `$now - original.created_at <= 15 minutes`, with `$now` from the injected `Clock`, checked inside one conditional `INSERT ... SELECT ... WHERE` statement. 0 rows -> re-read: original or vehicle missing -> 404, otherwise 409 `CORRECTION_WINDOW_CLOSED`.
3. Only the original author may correct (`created_by = current user`); another member with `vehicle_action:create` gets 403 `NOT_ACTION_AUTHOR`. Non-members get 404.
4. The vehicle must still be `IN_STOCK` (D5); otherwise 409 `VEHICLE_NOT_IN_STOCK`.
5. Endpoint: `POST /api/v1/dealerships/{d}/vehicles/{v}/actions/{a}/corrections` with `{note}` -> 201 and the new action, `Location` header.
6. Schema: nullable `vehicle_action.corrects_action_id` FK to `vehicle_action(id)`. Recorded as ADR 0005 (extends D4, supersedes nothing).

Added while writing the PRD (recommended answers to gaps the grill left open; confirm at the gate):

7. Only the vehicle's **current** action can be corrected: the same conditional statement requires that no action on that vehicle has a larger `id` than `{a}`. Otherwise 409 `ACTION_SUPERSEDED`. Reason: the correction becomes the newest row, so correcting an older action would make it current again over a later decision by another manager (P3).
8. Corrections point at the **root** action. When `{a}` is itself a correction, the new row's `corrects_action_id` is `{a}`'s `corrects_action_id`, and the 15-minute window and the author check run against that root. Correcting a correction never extends the window, and `corrects_action_id` never forms a chain longer than one hop.
9. The correction copies `action_type` from the action it corrects. The request body is `{note}` only: a required string of 1 to 1,000 characters (the D4 limit). Unknown fields, including `actionType`, are rejected with 400 `VALIDATION_FAILED`. An action logged without a note can be corrected to add one.
10. When the conditional insert writes 0 rows, the re-read answers in this order: vehicle or action missing, or the action not on this vehicle in this dealership -> 404 `NOT_FOUND`; caller is not the root's author -> 403 `NOT_ACTION_AUTHOR`; vehicle not `IN_STOCK` -> 409 `VEHICLE_NOT_IN_STOCK`; a newer action exists -> 409 `ACTION_SUPERSEDED`; window passed -> 409 `CORRECTION_WINDOW_CLOSED`.
11. `vehicle_action.created_at` is written from `Clock` (`$now`) on every insert, for logged actions and corrections alike, instead of relying on the column's `DEFAULT now()`. Otherwise a test with a pinned `Clock` compares `$now` with a database timestamp and the window cannot be tested. Same reasoning as ADR 0002.

## User Stories

1. As a manager, I want to correct the note on an action I just logged, so that colleagues do not act on a typo.
2. As a manager, I want the correction to keep the action type I chose, so that fixing a note cannot silently change the decision.
3. As a manager, I want to add a note to an action I logged without one, within the same 15 minutes, so that a forgotten detail can still be recorded.
4. As a manager, I want to correct my correction while still inside the original 15 minutes, so that a second typo can be fixed too.
5. As a manager, I want a clear 409 `CORRECTION_WINDOW_CLOSED` once 15 minutes have passed, so that I know to log a new action instead.
6. As a manager, I want the window to start when the action was first logged, not when I last corrected it, so that the rule is predictable.
7. As a manager, I want the corrected action to become the vehicle's current action, so that the list, detail and dashboard show the fixed note straight away.
8. As a manager, I want a 201 with the new action and its `Location`, so that my client can show the result without another request.
9. As a manager, I want an empty or over-long note rejected with 400 `VALIDATION_FAILED`, so that a correction follows the same rules as logging an action.
10. As a manager, I want an attempt to change the action type through the correction endpoint rejected, so that a type change is always a new, visible action.
11. As a manager, I want to be stopped with 409 `ACTION_SUPERSEDED` if a colleague logged a newer action in the meantime, so that my correction does not overturn their later decision.
12. As a manager, I want to be stopped with 409 `VEHICLE_NOT_IN_STOCK` once the vehicle is reserved or sold, so that the history of a vehicle that left stock stays as it was.
13. As a manager, I want to be stopped with 403 `NOT_ACTION_AUTHOR` when I try to correct a colleague's action, so that nobody puts words in someone else's name.
14. As an admin, I want the same author rule to apply to me, so that the author recorded on an action is always the person who wrote its note.
15. As a viewer, I want a 403 when I call the correction endpoint, so that read-only users cannot write actions.
16. As a member of another dealership, I want a 404 for this dealership's vehicles and actions, so that the API does not reveal that they exist.
17. As any member, I want a 404 for an action id that does not exist or belongs to another vehicle, so that ids cannot be probed across vehicles.
18. As a viewer, I want the action history to keep both the original and the correction, newest first, so that I can see what changed and who changed it.
19. As a viewer, I want each action in the history to say which action it corrects, if any, so that a client can mark it as a correction.
20. As a dealership manager reading the dashboard, I want a correction not to change the action-type counts or the "aging with no action" count, so that fixing a typo does not distort the KPIs.
21. As an auditor, I want the original row never updated or deleted, so that the append-only history (D4, D19) holds.
22. As an operator, I want two corrections sent at the same moment both to persist, with the newer one current, so that nothing is silently lost (P3).
23. As a developer, I want the window, author, stock and supersession checks in one conditional SQL statement, so that a correction cannot race past a status change or a newer action check.
24. As a developer, I want `now` to come from the injected `Clock`, so that tests can pin the time either side of the 15-minute boundary.

## Implementation Decisions

- **Module:** all of it lives in the `actions` module, which owns `vehicle_action`. No other module writes the table. `inventory` is read only to check the vehicle's status inside the same statement, as logging an action already does (P2). No new module dependency.
- **Endpoint:** `POST /api/v1/dealerships/{d}/vehicles/{v}/actions/{a}/corrections`, guarded by `JwtAuthGuard` and `DealershipGuard` with `@RequirePermission('vehicle_action:create')`. No new permission: the author rule is a data check in the service, not a permission (guards check permissions, never roles). Role 3 (Contract) fixes the exact request and response JSON.
- **Action resource:** gains `correctsActionId` (number or `null`) wherever an action is returned: the POST responses, the action history and `currentAction` on vehicle list and detail.
- **Write:** one `INSERT ... SELECT` that reads the target action, its root, and the vehicle, and inserts only when all hold: the action belongs to `{v}` in `{d}`; the root's `created_by` is the caller; the vehicle is `IN_STOCK`; no action on the vehicle has a larger `id`; `$now - root.created_at <= interval '15 minutes'` (inclusive). It copies `action_type`, sets `corrects_action_id` to the root id, `created_by` to the caller and `created_at` to `$now`. 0 rows -> re-read and answer per decision 10. No transaction and no lock.
- **Time:** the window is plain `timestamptz` subtraction in Postgres with `$now` passed as a parameter. No time-zone maths anywhere; the dealership's time zone plays no part.
- **Schema:** one migration adds `vehicle_action.corrects_action_id bigint NULL REFERENCES vehicle_action(id)`. Existing rows stay `NULL`; no backfill. No new index: the column is never filtered on in the MVP, and rows are never deleted, so the FK needs no index for delete checks. Role 3 confirms the DDL.
- **Logging an action** (the existing `POST /actions`) also starts writing `created_at` from `Clock` (decision 11).
- **ADR 0005:** "Note corrections are new actions that point at the corrected one", extending D4. The same PR updates `docs/research/backend-architecture.md`: D4's row, the §4.3 ER diagram, the §4.7 API table and the §4.15 test table.
- **Reads are unchanged:** "current action" stays the newest row by `id`; dashboard `actionStats` and `agingWithoutAction` need no change because a correction keeps the type and only exists on a vehicle that already has an action.

## Testing Decisions

- A good test drives the HTTP API and asserts on status, problem+json `code` and the returned and listed actions. It does not assert on the SQL or on service internals.
- **One seam:** the HTTP API, in integration tests against Testcontainers Postgres, with the `Clock` provider overridden to pin `now`. The rules live in one SQL statement, so there is no new pure `domain/` function to unit-test.
- **Prior art:** `test/integration/health.spec.ts` (boots `AppModule.forRoot` against `startMigratedPostgres()` and calls it with supertest) and `test/integration/db.spec.ts` (checks the migrated schema; extend it for the new column and FK). The D15/D16 route × role table gets a row for the new route.

| Rule | Test | Level |
| --- | --- | --- |
| D4 + ADR 0005 correction | Author corrects at +1 min -> 201, `Location`, same `actionType`, new note, `correctsActionId` = original; history holds both, newest first; the original row is unchanged; vehicle detail's `currentAction` is the correction | integration |
| 15-minute window | Clock pinned at +14:59 and +15:00 -> 201; at +15:01 -> 409 `CORRECTION_WINDOW_CLOSED` | integration |
| Window from the root | Correct at +10 min, then correct the correction at +16 min -> 409 `CORRECTION_WINDOW_CLOSED`; at +14 min -> 201 with `correctsActionId` = the root | integration |
| Author only | Another manager and an admin of the same dealership -> 403 `NOT_ACTION_AUTHOR`; viewer -> 403 `FORBIDDEN` | integration |
| D16 tenancy | Non-member -> 404 with the same body as a missing dealership; action id of another vehicle or dealership -> 404 | integration |
| D5 eligibility | Vehicle `RESERVED` or `SOLD` -> 409 `VEHICLE_NOT_IN_STOCK` | integration |
| Supersession | Another manager logs a newer action, then the author corrects the older one -> 409 `ACTION_SUPERSEDED` | integration |
| Request shape | Missing note, empty note, 1,001 characters, extra `actionType` field -> 400 `VALIDATION_FAILED`; 1,000 characters -> 201; correcting an action that had no note -> 201 | integration |
| P3 concurrency | Two corrections of the same action sent together -> both 201, the higher `id` is current | integration |
| D10/D11 KPIs | After a correction, dashboard `actionStats` and `agingWithoutAction` are unchanged | integration |
| Schema | Migration adds nullable `corrects_action_id` with an FK to `vehicle_action(id)` | integration |

## Diagrams

_Placeholder: the diagrams are published to `issue-<N>` once this issue exists._

## Design refs

- D4 (actions, append-only, latest is current), extended by ADR 0005
- D5 (actions only on `IN_STOCK`)
- D10, D11, D12 (dashboard counts that must not move)
- D15, D16 (permissions, non-member -> 404)
- D19 (`created_by` / `created_at` as the audit trail)
- P2 (conditional `INSERT ... SELECT`, 0 rows -> re-read), P3 (concurrent writes both persist)
- §4.2 modules (`actions` owns `vehicle_action`), §4.3 data model, §4.6 auth and guard chain, §4.7 API, §4.8 error model, §4.15 tests, §4.16 build order (step 5)
- ADR 0002 (timestamps written from `Clock`), ADR 0004 (enums as `text` + `CHECK`)

## Out of Scope

- Changing an action's type, deleting an action, or correcting after 15 minutes: the manager logs a new action.
- Correcting someone else's action, including by an admin.
- A configurable window (per dealership or by env var): 15 minutes is a constant.
- Showing a diff between the original and the corrected note; clients compare the two rows.
- `If-Match` / `412` on corrections (§6.2, same trigger as for concurrent actions).
- A `GET` for a single action; the `Location` header follows the existing `POST /actions` convention.

## Further Notes

- **Depends on build step 5** (§4.16): the `actions` module, `POST /actions` and the action history do not exist yet. This work lands after them, or as part of step 5.
- **Known limit:** under READ COMMITTED, a newer action committed at the same instant as a correction may not be visible to the correction's supersession check, so the correction can still land last and become current. The window is the same one the existing P2 action-logging pattern accepts; closing it needs a lock or `If-Match` (§6.2). Mark it with a `shortcut:` comment in code.
- **Manual step:** the PR adds a migration. Every environment re-runs `db:migrate` (already in `docs/environment-setup.md`); no new env var.
- **Glossary:** this introduces the term _correction_ (an action that fixes the note of an earlier action by the same author). There is no `GLOSSARY.md` yet; note it for `/domain-modeling`.
