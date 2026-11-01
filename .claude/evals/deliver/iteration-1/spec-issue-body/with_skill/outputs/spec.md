## Problem Statement

Managers sometimes log an action on a vehicle and only notice a typo in its note afterwards, for example "reduce by £5,00" instead of "£500". Actions are append-only (D4), so today the only fix is to log a second action of the same type with the right note. The history then shows two separate decisions where there was one, and nothing says the second one only fixes the first. Viewers and other managers read these notes (D15) and may act on the wrong figure.

## Solution

The manager who logged an action can correct its note within 15 minutes of logging it. The correction is stored as a new action that points at the original, and the original stays exactly as it was. The vehicle's current action shows the corrected note under the same action type. The history shows the original and each correction, with each correction linked to the action it fixes. After 15 minutes, for anyone other than the author, for a vehicle that is no longer in stock, or once a colleague has logged a newer action, the correction is refused with a clear reason.

## User Stories

1. As a manager, I want to correct the note of an action I logged a few minutes ago, so that my colleagues read the plan I meant rather than my typo.
2. As a manager, I want the correction to keep my original action type, so that fixing a note never changes what I decided to do with the car.
3. As a manager, I want the vehicle's current action to show my corrected note straight away, so that the list and the vehicle detail show the right text on the next poll.
4. As a manager, I want to correct the same action again within the 15 minutes, so that I can fix a second typo I spot after the first fix.
5. As a manager, I want the 15 minutes to count from when I logged the original action, not from my last correction, so that the rule is easy to predict.
6. As a manager, I want a clear "correction window closed" error after 15 minutes, so that I know to log a new action instead.
7. As a manager, I want a clear error when a colleague has logged a newer action on the vehicle since mine, so that my correction can't silently replace their decision as the current one.
8. As a manager, I want a clear error when the vehicle has been reserved or sold since I logged the action, so that I know actions on that car are closed.
9. As a manager, I want to be told when I try to correct another manager's action, so that I understand only the author can fix a note.
10. As a manager, I want my corrected note held to the same 1,000-character limit as a new action's note, so that corrections and new actions follow the same rules.
11. As a manager, I want the API to return the new correction with its link, so that my client can show it without fetching the whole history again.
12. As a manager who reviews a car's history, I want to see the original note next to its correction, so that nothing is hidden about what was first written and when.
13. As a manager who reviews a car's history, I want each correction to say which action it corrects, so that I don't read one decision as two.
14. As a viewer, I want to read the corrected note as the vehicle's current action, so that I act on the right information.
15. As a viewer, I want to be refused if I try to correct a note, so that read-only staff can't change managers' decisions.
16. As an admin who logged an action, I want the same correction rights as a manager, so that the rule depends on who wrote the action, not on my role.
17. As a user outside the dealership, I want the same "not found" answer as for a dealership that doesn't exist, so that the correction route reveals nothing about other dealerships.
18. As a dealership, I want corrections to keep the action history append-only, so that the history stays a full record of who wrote what and when (D19).
19. As a dealership, I want a correction to leave the "aging with no action" count and the current-action-by-type counts unchanged, so that fixing a typo never moves a KPI.
20. As an operator, I want every refused correction to come back as problem+json with a specific `code`, so that a client or a log search can tell the reasons apart.

## Decisions

Decisions 1 to 6 were settled by the grill. Decisions 7 to 13 fill gaps the spec needed closed, and each one states its reason; they are the recommended answers, for review at the gate.

1. **Corrections are new rows.** Actions stay append-only (D4). A note fix is a new `vehicle_action` row with `corrects_action_id` pointing at the original; the original row is never updated. The newest row by `id` is the current action.
2. **15-minute window, checked in one statement.** The fix is allowed only while `$now - original.created_at <= 15 minutes`, with `$now` from the injected `Clock`, checked inside one conditional `INSERT … SELECT … WHERE` statement (the P2 pattern). 0 rows → re-read: original or vehicle missing → 404, otherwise 409 `CORRECTION_WINDOW_CLOSED` (refined by decision 11).
3. **Only the author.** Only the original author may correct (`created_by = current user`). Another member with `vehicle_action:create` gets 403 `NOT_ACTION_AUTHOR`. Non-members get 404 (D16).
4. **Vehicle still in stock.** The vehicle must still be `IN_STOCK` (D5); otherwise 409 `VEHICLE_NOT_IN_STOCK`.
5. **Endpoint.** `POST /api/v1/dealerships/{d}/vehicles/{v}/actions/{a}/corrections` with `{note}` → 201 with the new action and a `Location` header, as `POST …/actions` returns.
6. **Schema.** A nullable `vehicle_action.corrects_action_id` FK to `vehicle_action(id)`, added by a new migration (ADR-0001: `0000_init` is not edited); existing rows stay `NULL`. Recorded as ADR-0005, which extends D4 and supersedes nothing.
7. **Only while the original is still current** _(spec)_. The correction is accepted only while the vehicle's newest action is the original or one of its corrections; otherwise 409 `ACTION_SUPERSEDED`, checked in the same conditional `INSERT`. Reason: the correction becomes the newest row (decision 1), so without this rule a correction made after a colleague's newer action would silently replace that colleague's decision as the current one, the lost update P3 rules out.
8. **What a correction row holds** _(spec)_. It copies `action_type`, `vehicle_id` and `dealership_id` from the original, so only the note changes and the current-action-by-type counts (D10) stay put. `corrects_action_id` always holds the original's id, never another correction's. `{a}` must be an original: the id of a correction answers 404, because corrections are the sub-collection of an original. Several corrections of one original are allowed inside its window; the newest is current. Reason: one level of linking keeps the window, author and supersession checks to one join and stops a chain of corrections from stretching the window.
9. **Request validation** _(spec)_. `note` is required, 1 to 1,000 characters (the D4 limit); unknown fields are rejected (400 `VALIDATION_FAILED`, §4.8). Reason: the requirement is fixing a typo; changing the action type or clearing the note is a different decision (see Out of Scope).
10. **Permission** _(spec)_. The route requires `vehicle_action:create`; the role→permission map does not change. A Viewer gets 403 `FORBIDDEN` from `DealershipGuard` before the author check runs (§4.6). Reason: correcting is a form of logging an action, and the author rule (decision 3) is what narrows it further.
11. **Failure precedence** _(spec)_. On 0 rows, one re-read decides, in this order: vehicle not in `{d}`, action not on `{v}`, or `{a}` is a correction → 404 `NOT_FOUND`; not the author → 403 `NOT_ACTION_AUTHOR`; vehicle not `IN_STOCK` → 409 `VEHICLE_NOT_IN_STOCK`; window closed → 409 `CORRECTION_WINDOW_CLOSED`; superseded → 409 `ACTION_SUPERSEDED`. Reason: existence before authorisation before state, the same order as the guard chain, and a fixed order the tests can pin.
12. **Time comes from `Clock` on both ends** _(spec)_. The correction row's `created_at` is set to `$now`, not left to the column's `DEFAULT now()`. The window compares two instants (`timestamptz` minus `timestamptz`), so it needs no time-zone maths. This assumes that logging an action (build step 5) also sets `created_at` from `$now`, as the `Clock` invariant requires; otherwise a pinned clock in tests would be compared against the database's real time.
13. **Reads** _(spec)_. `GET …/vehicles/{v}/actions` returns originals and corrections newest first, each with `correctsActionId` (`null` for an original). The current action is still the newest row, so the list, detail and dashboard queries do not change, and D11 is unaffected (a correction exists only where an action already did). No new index: the original is read by its primary key, and the supersession check uses the existing `(vehicle_id, id DESC)` index.

## Diagrams

_Placeholder: the diagrams are published to `issue-<N>` once this issue exists, and their image lines with a one-line caption each go here._

## Design refs

- **D4** actions are append-only; extended by ADR-0005 (decisions 1, 6, 8).
- **D5** actions only on `IN_STOCK` vehicles (decision 4).
- **D10, D11, D12** dashboard counts and "aging with no action" must not move (decisions 8, 13).
- **D15, D16** permissions not roles, non-member → 404 (decisions 3, 10).
- **D19** `created_by` / `created_at` remain the audit trail; corrections keep it complete because nothing is overwritten.
- **P2** race-free conditional writes, `INSERT … SELECT … WHERE`, 0 rows → re-read (decisions 2, 7, 11).
- **P3** two managers act on the same car; nothing is silently lost (decision 7).
- **§4.3** data model (`vehicle_action`, index `(vehicle_id, id DESC)`); **§4.6** guard chain and permission map; **§4.7** API table (`POST …/actions`); **§4.8** error model; **§4.9** "Logging an action" sequence, which this flow mirrors; **§4.15** test plan; **§4.16** build step 5 (actions).
- **ADR-0001** schema changes ship as new migrations; **ADR-0005** corrections as appended rows (new, from the grill).
- **§6.2 Audit**: its trigger ("edits beyond status") is not met, because a correction appends a row rather than editing one, so no `audit_event` table is needed.

## Testing Decisions

A good test here calls the HTTP endpoint and checks what a client sees (status, problem+json `code`, response body) and what a later read returns. It never asserts on SQL text or service internals. The seam is the existing one: the Nest app over Supertest against a Testcontainers Postgres with the committed migrations applied, with `Clock` pinned so the window boundaries are exact. No new seam and no unit-level domain function are needed, because every rule lives in the one conditional `INSERT` and its re-read.

Modules tested: `actions` (endpoint, conditional insert, re-read), the migration (new column and FK), and the route × role table in `auth`'s RBAC test, which gains the new route.

Prior art: `health.spec.ts` (app and Supertest over Testcontainers), `db.spec.ts` (migration and constraint assertions), the `startMigratedPostgres` helper, and the D4/P3 and D5 action tests that build step 5 adds.

| Rule                                    | Test                                                                                                                                                                                    | Level       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Decision 1, D4: append-only correction  | Correction → 201; a new row with `correctsActionId` = original; the original's note and `created_at` are unchanged; history lists both, newest first; current action has the new note | integration |
| Decision 8: type and links              | The correction keeps the original's `actionType`; a second correction within the window also points at the original; `{a}` = a correction's id → 404                                  | integration |
| Decision 2, 12: window boundary         | `Clock` pinned at original + 15:00 → 201; at original + 15:00.001 → 409 `CORRECTION_WINDOW_CLOSED`; a second correction at + 16:00 → 409 (the window counts from the original)          | integration |
| Decision 3: author only                 | Another manager → 403 `NOT_ACTION_AUTHOR`; an admin correcting their own action → 201                                                                                                   | integration |
| Decision 10, D15/D16: permission, scope | Route × role table: Viewer → 403 `FORBIDDEN`; non-member → 404 with the same body as a missing dealership; no token → 401                                                               | integration |
| Decision 4, D5: vehicle in stock        | Vehicle `RESERVED` or `SOLD` after the action → 409 `VEHICLE_NOT_IN_STOCK`                                                                                                              | integration |
| Decision 7, P3: supersession            | A colleague logs a newer action → 409 `ACTION_SUPERSEDED`, and the colleague's action stays current                                                                                     | integration |
| Decision 11: not found and precedence   | Unknown `{a}`, `{a}` on another vehicle, `{a}` in another dealership → 404; not author and window closed → 403; not in stock and window closed → 409 `VEHICLE_NOT_IN_STOCK`             | integration |
| Decision 9: validation                  | Missing note, empty note, 1,001 characters, an unknown field → 400 `VALIDATION_FAILED`                                                                                                  | integration |
| Decision 13, D10/D11: reads unchanged   | After a correction: dashboard `agingWithoutAction` and `actionStats` are unchanged; the list's `currentAction` shows the corrected note                                                | integration |
| Decision 6: schema                      | The migration adds the nullable column and FK; existing rows read `NULL`; an unknown `corrects_action_id` is rejected                                                                  | integration |

## Out of Scope

- Changing an action's type, clearing its note, or deleting an action. A different plan is a new action.
- Correcting another member's action, including by an Admin.
- A configurable window, per dealership or by env var. 15 minutes is a constant.
- Collapsing corrections into their original in the history response; the client can group them by `correctsActionId`.
- `If-Match` / `412` on actions and an `audit_event` table (§6.2), whose triggers this does not meet.
- Any change to the list, detail or dashboard queries.

## Further Notes

- **Depends on** build step 2 (auth: `DealershipGuard`, `@RequirePermission`) and build step 5 (actions: `POST` and `GET …/actions`), neither of which exists yet. Start this after both are merged.
- **Accepted race:** a correction and a colleague's new action committed at the same moment can both succeed, because the supersession check reads the newest row before the colleague's insert commits. Both stay in the history and the newest by `id` is current, which is P3's rule; no lock is added (CLAUDE.md: conditional SQL, not locks).
- **`currentAction.createdAt`** after a correction is the correction's time, up to 15 minutes later than the original. That is acceptable for a typo fix; a client that needs the original time reads it through `correctsActionId`.
- **Doc impact** for the PR: `docs/system-design.md` (actions module, `vehicle_action` row, race-free writes bullet), `docs/diagrams/schema-er` (new column and FK), `docs/adr/0005-…` and its row in `docs/adr/README.md`, and `GLOSSARY.md` for _correction_ if the grill step did not already add it.
- **Manual steps:** none new. The migration runs through the existing `db:migrate` step in `docs/environment-setup.md`.
