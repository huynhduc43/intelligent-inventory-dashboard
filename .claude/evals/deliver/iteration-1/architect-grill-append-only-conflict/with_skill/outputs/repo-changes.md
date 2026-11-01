# Repo changes (sandbox, uncommitted)

## git status --short

```
 M docs/adr/README.md
 M docs/research/backend-architecture.md
?? GLOSSARY.md
?? docs/adr/0005-author-may-correct-action-note-for-15-minutes.md
```

## git diff

```diff
diff --git a/docs/adr/README.md b/docs/adr/README.md
index 5cfaa21..3ebdd6e 100644
--- a/docs/adr/README.md
+++ b/docs/adr/README.md
@@ -36,9 +36,10 @@ Two places hold this project's accepted decisions:
 
 ## ADRs
 
-| ADR                                                         | Decision                                                      | Supersedes |
-| ----------------------------------------------------------- | ------------------------------------------------------------- | ---------- |
-| [0001](0001-migrations-run-outside-the-app.md)              | Migrations run outside the app, not at boot                   | —          |
-| [0002](0002-updated-at-set-from-clock.md)                   | `updated_at` is set by the service from `Clock`               | —          |
-| [0003](0003-health-bodies-are-not-problem-json.md)          | Health endpoints keep Terminus's body, not problem+json       | —          |
-| [0004](0004-text-check-and-app-side-timezone-validation.md) | Enums are `text` + `CHECK`; time-zone validity checked in app | —          |
+| ADR                                                           | Decision                                                      | Supersedes   |
+| ------------------------------------------------------------- | ------------------------------------------------------------- | ------------ |
+| [0001](0001-migrations-run-outside-the-app.md)                | Migrations run outside the app, not at boot                   | —            |
+| [0002](0002-updated-at-set-from-clock.md)                     | `updated_at` is set by the service from `Clock`               | —            |
+| [0003](0003-health-bodies-are-not-problem-json.md)            | Health endpoints keep Terminus's body, not problem+json       | —            |
+| [0004](0004-text-check-and-app-side-timezone-validation.md)   | Enums are `text` + `CHECK`; time-zone validity checked in app | —            |
+| [0005](0005-author-may-correct-action-note-for-15-minutes.md) | The author may correct an action's note for 15 minutes        | D4 (in part) |
diff --git a/docs/research/backend-architecture.md b/docs/research/backend-architecture.md
index b92dcd1..f415a81 100644
--- a/docs/research/backend-architecture.md
+++ b/docs/research/backend-architecture.md
@@ -91,27 +91,27 @@ At 25 rps, each poll runs one aggregate over ≤ 2,000 rows (milliseconds). One
 
 **U** = user decision. **A** = my assumption (to be listed in the design doc).
 
-| #   | Topic                  | Decision                                                                                                                                                                                                                                                      | U/A                         |
-| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
-| D1  | Age source             | Age counts from `stocked_on`, the date the vehicle arrived in _this_ dealership's stock, not `created_at`.                                                                                                                                                    | U                           |
-| D2  | Day counting           | Calendar days in the dealership's time zone: `daysInStock = today_local − stocked_on`. See P1.                                                                                                                                                                | A                           |
-| D3  | Tiers                  | `FRESH` < watch ≤ `WATCH` ≤ aging < `AGING`. Defaults watch 60, aging 90. One pair per dealership, `1 ≤ watch < aging ≤ 3650`.                                                                                                                                | U (bounds A)                |
-| D4  | Actions                | Enum `PRICE_REDUCTION_PLANNED, TRANSFER, AUCTION, PROMOTION, MONITOR, OTHER` plus an optional note (≤ 1,000 chars). Append-only; the latest is current.                                                                                                       | U (note length A)           |
-| D5  | Who can get actions    | Any `IN_STOCK` vehicle. Aging ones are highlighted, not required. `RESERVED`/`SOLD` → `409`.                                                                                                                                                                  | U (RESERVED rule A)         |
-| D6  | Lifecycle              | `IN_STOCK ⇄ RESERVED`, either → `SOLD`. `SOLD` is terminal.                                                                                                                                                                                                   | U                           |
-| D7  | List default           | `status=IN_STOCK`, oldest first. Filterable by status.                                                                                                                                                                                                        | U                           |
-| D8  | Data sources           | Seed data plus `POST /vehicles` and a status change endpoint.                                                                                                                                                                                                 | U (CSV import deferred, §6) |
-| D9  | "Real-time"            | Every read is computed fresh. The client polls every 10 s.                                                                                                                                                                                                    | U                           |
-| D10 | Insights               | KPI summary (total in stock, count per tier, aging with no action, average days in stock), breakdowns by make/model and by bucket (0–30, 31–60, 61–90, 90+), current-action counts by type. No cost figure. Buckets are fixed, independent of the thresholds. | U (buckets A)               |
-| D11 | "Aging with no action" | An aging `IN_STOCK` vehicle with no action ever logged. `MONITOR` counts as an action.                                                                                                                                                                        | A                           |
-| D12 | KPI population         | `IN_STOCK` only. `RESERVED` and `SOLD` are excluded.                                                                                                                                                                                                          | U                           |
-| D13 | Auth                   | Email + password (argon2id). One access JWT, 1 h, no refresh token. Login is rate-limited per IP.                                                                                                                                                             | U (TTL and no-refresh A)    |
-| D14 | Password rule          | 15–128 characters, no composition rules.                                                                                                                                                                                                                      | U (max A)                   |
-| D15 | Permissions            | Guards check **permissions**, never role names. Roles `ADMIN`, `MANAGER`, `VIEWER` and the role→permission map are hardcoded in code. Viewers can read action notes.                                                                                          | U                           |
-| D16 | Tenancy                | `user_dealership(user_id, dealership_id, role)`. Non-member → `404`.                                                                                                                                                                                          | U                           |
-| D17 | Provisioning           | Dealerships and users come from the seed script. No sign-up, no user or dealership API.                                                                                                                                                                       | A (scope cut)               |
-| D18 | VIN                    | 17 chars, `[A-HJ-NPR-Z0-9]`, uppercased, immutable. Unique among _non-sold_ vehicles per dealership, so a re-acquired car gets a new row.                                                                                                                     | A                           |
-| D19 | Who did what           | `vehicle_action.created_by/created_at` and `vehicle.updated_by/updated_at` are the audit trail in the MVP.                                                                                                                                                    | A                           |
+| #   | Topic                  | Decision                                                                                                                                                                                                                                                                                                  | U/A                         |
+| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
+| D1  | Age source             | Age counts from `stocked_on`, the date the vehicle arrived in _this_ dealership's stock, not `created_at`.                                                                                                                                                                                                | U                           |
+| D2  | Day counting           | Calendar days in the dealership's time zone: `daysInStock = today_local − stocked_on`. See P1.                                                                                                                                                                                                            | A                           |
+| D3  | Tiers                  | `FRESH` < watch ≤ `WATCH` ≤ aging < `AGING`. Defaults watch 60, aging 90. One pair per dealership, `1 ≤ watch < aging ≤ 3650`.                                                                                                                                                                            | U (bounds A)                |
+| D4  | Actions                | Enum `PRICE_REDUCTION_PLANNED, TRANSFER, AUCTION, PROMOTION, MONITOR, OTHER` plus an optional note (≤ 1,000 chars). Append-only; the latest is current. _Superseded in part by [ADR-0005](../adr/0005-author-may-correct-action-note-for-15-minutes.md): the author may correct the note for 15 minutes._ | U (note length A)           |
+| D5  | Who can get actions    | Any `IN_STOCK` vehicle. Aging ones are highlighted, not required. `RESERVED`/`SOLD` → `409`.                                                                                                                                                                                                              | U (RESERVED rule A)         |
+| D6  | Lifecycle              | `IN_STOCK ⇄ RESERVED`, either → `SOLD`. `SOLD` is terminal.                                                                                                                                                                                                                                               | U                           |
+| D7  | List default           | `status=IN_STOCK`, oldest first. Filterable by status.                                                                                                                                                                                                                                                    | U                           |
+| D8  | Data sources           | Seed data plus `POST /vehicles` and a status change endpoint.                                                                                                                                                                                                                                             | U (CSV import deferred, §6) |
+| D9  | "Real-time"            | Every read is computed fresh. The client polls every 10 s.                                                                                                                                                                                                                                                | U                           |
+| D10 | Insights               | KPI summary (total in stock, count per tier, aging with no action, average days in stock), breakdowns by make/model and by bucket (0–30, 31–60, 61–90, 90+), current-action counts by type. No cost figure. Buckets are fixed, independent of the thresholds.                                             | U (buckets A)               |
+| D11 | "Aging with no action" | An aging `IN_STOCK` vehicle with no action ever logged. `MONITOR` counts as an action.                                                                                                                                                                                                                    | A                           |
+| D12 | KPI population         | `IN_STOCK` only. `RESERVED` and `SOLD` are excluded.                                                                                                                                                                                                                                                      | U                           |
+| D13 | Auth                   | Email + password (argon2id). One access JWT, 1 h, no refresh token. Login is rate-limited per IP.                                                                                                                                                                                                         | U (TTL and no-refresh A)    |
+| D14 | Password rule          | 15–128 characters, no composition rules.                                                                                                                                                                                                                                                                  | U (max A)                   |
+| D15 | Permissions            | Guards check **permissions**, never role names. Roles `ADMIN`, `MANAGER`, `VIEWER` and the role→permission map are hardcoded in code. Viewers can read action notes.                                                                                                                                      | U                           |
+| D16 | Tenancy                | `user_dealership(user_id, dealership_id, role)`. Non-member → `404`.                                                                                                                                                                                                                                      | U                           |
+| D17 | Provisioning           | Dealerships and users come from the seed script. No sign-up, no user or dealership API.                                                                                                                                                                                                                   | A (scope cut)               |
+| D18 | VIN                    | 17 chars, `[A-HJ-NPR-Z0-9]`, uppercased, immutable. Unique among _non-sold_ vehicles per dealership, so a re-acquired car gets a new row.                                                                                                                                                                 | A                           |
+| D19 | Who did what           | `vehicle_action.created_by/created_at` and `vehicle.updated_by/updated_at` are the audit trail in the MVP.                                                                                                                                                                                                | A                           |
 
 ---
 
```

## New file: GLOSSARY.md

````md
# Intelligent Inventory Dashboard

A dealership's view of its vehicle stock: how long each car has been in stock, and what its managers plan to do about the ones that are aging.

## Language

### Actions

**Action**:
A manager's recorded decision about one vehicle, of a fixed type, with an optional note. A changed decision is a new action, never an edit of an earlier one.
_Avoid_: task, plan, event

**Current action**:
The vehicle's most recently logged action.
_Avoid_: active action, action status

**Note**:
The free text on an action that explains the decision.
_Avoid_: comment, description

**Author**:
The user who logged an action.
_Avoid_: owner, creator

**Note correction**:
The author replacing an action's note within the correction window. The action's type, author and time stay as logged, and it does not count as a new action.
_Avoid_: action edit, action update

**Correction window**:
The 15 minutes after an action is logged, during which its author may make a note correction.
_Avoid_: edit window, grace period
````

## New file: docs/adr/0005-author-may-correct-action-note-for-15-minutes.md

````md
# The author may correct an action's note for 15 minutes

D4 made actions append-only, and CLAUDE.md says never to update them. Managers log notes with typos, so we relax that rule for one column: the user who logged an action may replace its `note` while `now − created_at ≤ 15 minutes`. Everything else on the row (`id`, `action_type`, `vehicle_id`, `created_by`, `created_at`) stays immutable, and a changed decision is still a new action (D4, P3), so "newest by `id` is current" and "nothing is silently lost" still hold for decisions. A correction is one conditional `UPDATE vehicle_action SET note = $note WHERE id = $a AND vehicle_id = $v AND dealership_id = $d AND created_by = $user AND created_at >= $now - interval '15 minutes'`. When it touches 0 rows, re-read the action: missing → `404`, another author → `403`, otherwise → `409`. `$now` comes from `Clock`. The window is elapsed time, not calendar days, so no time zone is involved; it uses only minute units, which subtracting from a `timestamptz` does not tie to the session time zone.

## Considered options

- **A correction as a new action** (keep strict append-only): it becomes current even when another manager logged an action in between, it shows the typo in the history next to the fix, and it needs an `IN_STOCK` vehicle. Rejected.
- **A note-revision table:** keeps every version, but adds a sixth table and a join to every action read in exchange for an audit nobody asked for. Rejected for now; §6's `audit_event` table is the upgrade path once compliance asks.

## Consequences

- The text before the correction is not kept, and nothing marks a note as corrected. The author bound and the 15-minute window keep that loss to the author's own fresh typo.
- `vehicle_action.created_at` must be set from `Clock` on insert (the ADR-0002 pattern), not by `DEFAULT now()` alone, so tests can pin both ends of the window.
````
