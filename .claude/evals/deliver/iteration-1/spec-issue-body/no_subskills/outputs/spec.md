## Requirement

Managers sometimes log an action with a typo in its note. Let the manager who logged an action fix its note within 15 minutes of logging it.

Depends on §4.16 step 5 (actions: log and history, `POST`/`GET …/vehicles/{v}/actions`), which this builds on. One vertical slice, so no slice issues.

## Decisions

Settled by the grill. Together with the `Chosen:` contract comment, these are the spec.

1. Actions stay append-only (D4). A note fix is a new `vehicle_action` row with `corrects_action_id` pointing at the original; the original row is never updated. The newest row by `id` is the current action.
2. The fix is allowed only while `$now - original.created_at <= 15 minutes`, with `$now` from the injected `Clock`, checked inside one conditional `INSERT ... SELECT ... WHERE` statement. 0 rows -> re-read: original or vehicle missing -> 404, otherwise 409 `CORRECTION_WINDOW_CLOSED`.
3. Only the original author may correct (`created_by = current user`); another member with `vehicle_action:create` gets 403 `NOT_ACTION_AUTHOR`. Non-members get 404.
4. The vehicle must still be `IN_STOCK` (D5); otherwise 409 `VEHICLE_NOT_IN_STOCK`.
5. Endpoint: `POST /api/v1/dealerships/{d}/vehicles/{v}/actions/{a}/corrections` with `{note}` -> 201 and the new action, `Location` header.
6. Schema: nullable `vehicle_action.corrects_action_id` FK to `vehicle_action(id)`. Recorded as ADR 0005 (extends D4, supersedes nothing).

## Diagrams

_Placeholder: diagrams are added here once drawn and published to `issue-<N>`._

## Design refs

- **D4** (actions append-only, newest is current; note ≤ 1,000 chars) and **P3** (concurrent actions both persist): the correction is a new row, never an `UPDATE`.
- **D5** and **§4.5**: actions only on `IN_STOCK` vehicles.
- **P2**: race-free conditional write, `INSERT … SELECT … WHERE`, then re-read on 0 rows.
- **P1**: `$now` comes from the injected `Clock` and is passed into SQL as a parameter. The window is a `timestamptz` difference, so there is no time-zone maths.
- **D15/D16** and **§4.6**: `@RequirePermission('vehicle_action:create')`; non-member → 404, member without the permission → 403.
- **D19**: `created_by` / `created_at` on the correction row are the audit trail of who fixed what.
- **§4.2**: `actions` owns `vehicle_action` and is the only module that writes it.
- **§4.3**: `vehicle_action` table, extended by the new column.
- **§4.7**: new route next to `POST …/vehicles/{v}/actions`.
- **§4.8**: problem+json errors with `code`.
- **§4.15**: test rows below are added to it.
- **ADR-0005**: `corrects_action_id`, extends D4, supersedes nothing.
- **ADR-0002**: timestamps a test must pin come from `Clock`.

## Acceptance criteria

`{d}`, `{v}`, `{a}` are the dealership, vehicle and action ids. "Author" is the user in the original action's `created_by`.

1. The author, within 15 minutes of logging action `{a}` (the bound is inclusive), posts `{note}` to `…/vehicles/{v}/actions/{a}/corrections` and gets `201` with the new action and a `Location` header.
2. The new row has `corrects_action_id = {a}`, the original's `action_type`, the new `note`, `created_by` = the author. The original row is unchanged.
3. `GET …/vehicles/{v}/actions` lists both rows, newest first. The vehicle's `currentAction` is the correction.
4. A post after the 15-minute window gets `409 CORRECTION_WINDOW_CLOSED`.
5. Another member with `vehicle_action:create` gets `403 NOT_ACTION_AUTHOR`. A viewer gets `403 FORBIDDEN`. A non-member gets `404` with the same body as for a missing dealership.
6. A `RESERVED` or `SOLD` vehicle gets `409 VEHICLE_NOT_IN_STOCK`.
7. An unknown action, an action of another vehicle, or a vehicle of another dealership gets `404`.
8. A body without `note`, a `note` over 1,000 characters, or an unknown field gets `400 VALIDATION_FAILED`.
9. The window, author and `IN_STOCK` checks are in one conditional `INSERT … SELECT … WHERE` with `$now` from `Clock`. No transaction, no lock, no `UPDATE` or `DELETE` of `vehicle_action`.

## Tests

| Rule                       | Test                                                                                                                                                                         | Level       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| D4/ADR-0005 append-only    | Correction inserts a row with `corrects_action_id`, the original's `action_type` and the new note; the original row is unchanged; history shows both; current = correction | integration |
| Decision 2 window          | Original seeded with an explicit `created_at`; `Clock` pinned at +14:59 and +15:00 → 201; at +15:01 → 409 `CORRECTION_WINDOW_CLOSED`                                         | integration |
| Decision 3 author only     | Second manager → 403 `NOT_ACTION_AUTHOR`; author → 201                                                                                                                       | integration |
| D5 eligibility             | `RESERVED` and `SOLD` vehicle → 409 `VEHICLE_NOT_IN_STOCK`                                                                                                                  | integration |
| D16 tenancy                | Unknown `{a}`, `{a}` of another vehicle, `{v}` of another dealership → 404                                                                                                   | integration |
| Validation                 | Missing `note`, `note` > 1,000 chars, unknown field → 400 `VALIDATION_FAILED`                                                                                                | integration |
| D15/D16 RBAC + tenancy     | The new route added to the route × role table (viewer → 403, non-member → 404)                                                                                               | integration |
