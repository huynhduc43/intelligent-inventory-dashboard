# Repo changes (sandbox, uncommitted)

## git status --short

```
 M docs/adr/README.md
 M docs/research/backend-architecture.md
?? GLOSSARY.md
?? docs/adr/0005-author-may-fix-action-note-within-15-minutes.md
```

## git diff

```diff
diff --git a/docs/adr/README.md b/docs/adr/README.md
index 5cfaa21..d221696 100644
--- a/docs/adr/README.md
+++ b/docs/adr/README.md
@@ -14,7 +14,7 @@ Two places hold this project's accepted decisions:
 | D1  | Age counts from `stocked_on`                       |
 | D2  | Calendar days in the dealership's time zone        |
 | D3  | Tiers and per-dealership thresholds                |
-| D4  | Action types, append-only                          |
+| D4  | Action types, append-only (note: see ADR-0005)     |
 | D5  | Actions allowed on any `IN_STOCK` vehicle          |
 | D6  | Vehicle lifecycle                                  |
 | D7  | List default and filters                           |
@@ -36,9 +36,10 @@ Two places hold this project's accepted decisions:
 
 ## ADRs
 
-| ADR                                                         | Decision                                                      | Supersedes |
-| ----------------------------------------------------------- | ------------------------------------------------------------- | ---------- |
-| [0001](0001-migrations-run-outside-the-app.md)              | Migrations run outside the app, not at boot                   | —          |
-| [0002](0002-updated-at-set-from-clock.md)                   | `updated_at` is set by the service from `Clock`               | —          |
-| [0003](0003-health-bodies-are-not-problem-json.md)          | Health endpoints keep Terminus's body, not problem+json       | —          |
-| [0004](0004-text-check-and-app-side-timezone-validation.md) | Enums are `text` + `CHECK`; time-zone validity checked in app | —          |
+| ADR                                                          | Decision                                                      | Supersedes   |
+| ------------------------------------------------------------ | ------------------------------------------------------------- | ------------ |
+| [0001](0001-migrations-run-outside-the-app.md)               | Migrations run outside the app, not at boot                   | —            |
+| [0002](0002-updated-at-set-from-clock.md)                    | `updated_at` is set by the service from `Clock`               | —            |
+| [0003](0003-health-bodies-are-not-problem-json.md)           | Health endpoints keep Terminus's body, not problem+json       | —            |
+| [0004](0004-text-check-and-app-side-timezone-validation.md)  | Enums are `text` + `CHECK`; time-zone validity checked in app | —            |
+| [0005](0005-author-may-fix-action-note-within-15-minutes.md) | The author may fix an action's note within 15 minutes         | D4 (in part) |
diff --git a/docs/research/backend-architecture.md b/docs/research/backend-architecture.md
index b92dcd1..fb01143 100644
--- a/docs/research/backend-architecture.md
+++ b/docs/research/backend-architecture.md
@@ -96,7 +96,7 @@ At 25 rps, each poll runs one aggregate over ≤ 2,000 rows (milliseconds). One
 | D1  | Age source             | Age counts from `stocked_on`, the date the vehicle arrived in _this_ dealership's stock, not `created_at`.                                                                                                                                                    | U                           |
 | D2  | Day counting           | Calendar days in the dealership's time zone: `daysInStock = today_local − stocked_on`. See P1.                                                                                                                                                                | A                           |
 | D3  | Tiers                  | `FRESH` < watch ≤ `WATCH` ≤ aging < `AGING`. Defaults watch 60, aging 90. One pair per dealership, `1 ≤ watch < aging ≤ 3650`.                                                                                                                                | U (bounds A)                |
-| D4  | Actions                | Enum `PRICE_REDUCTION_PLANNED, TRANSFER, AUCTION, PROMOTION, MONITOR, OTHER` plus an optional note (≤ 1,000 chars). Append-only; the latest is current.                                                                                                       | U (note length A)           |
+| D4  | Actions                | Enum `PRICE_REDUCTION_PLANNED, TRANSFER, AUCTION, PROMOTION, MONITOR, OTHER` plus an optional note (≤ 1,000 chars). Append-only; the latest is current. Partly superseded by [ADR-0005](../adr/0005-author-may-fix-action-note-within-15-minutes.md).         | U (note length A)           |
 | D5  | Who can get actions    | Any `IN_STOCK` vehicle. Aging ones are highlighted, not required. `RESERVED`/`SOLD` → `409`.                                                                                                                                                                  | U (RESERVED rule A)         |
 | D6  | Lifecycle              | `IN_STOCK ⇄ RESERVED`, either → `SOLD`. `SOLD` is terminal.                                                                                                                                                                                                   | U                           |
 | D7  | List default           | `status=IN_STOCK`, oldest first. Filterable by status.                                                                                                                                                                                                        | U                           |
```

## New file: GLOSSARY.md

````markdown
# Glossary

## Actions

**Action**: a proposed next step a user logs for one `IN_STOCK` vehicle, one of the D4 types (`PRICE_REDUCTION_PLANNED`, `TRANSFER`, `AUCTION`, `PROMOTION`, `MONITOR`, `OTHER`), with an optional note. A row in `vehicle_action`. Append-only except its note (ADR-0005).
_Avoid_: status (that is the vehicle's lifecycle state), task, plan.

**Current action**: a vehicle's action with the highest `id`. Fixing a note never changes which action is current.
_Avoid_: latest status, active action.

**Note**: the optional free text on an action, up to 1,000 characters. The only part of an action that can change after it is logged.
_Avoid_: comment, description.

**Author**: the user who logged an action (`vehicle_action.created_by`). The only user who may fix its note.
_Avoid_: owner, editor.

**Note edit window**: the 15 minutes after an action's `created_at`, inclusive, during which its author may fix the note. Measured against `Clock`, as instants, with no time zone involved.
_Avoid_: grace period, edit timeout.
````

## New file: docs/adr/0005-author-may-fix-action-note-within-15-minutes.md

````markdown
# The author may fix an action's note within 15 minutes

Supersedes D4 in part. Actions stay append-only in every other respect: `action_type`, `created_by`, `created_at` and `id` never change and rows are never deleted. The one exception is `note`: the user who logged the action (`created_by`) may overwrite it while `created_at >= now − 15 minutes`, measured against `Clock` and passed into SQL as a parameter. The write is one conditional `UPDATE … WHERE created_by = $user AND created_at >= $now − interval '15 minutes'` that also sets `note_edited_at`; 0 rows → re-read: missing → 404, another author → 403, otherwise `409 NOTE_EDIT_WINDOW_CLOSED`. The route reuses `vehicle_action:create`, and the vehicle's status does not matter (D5 governs new decisions, not typo fixes). Because the window is checked against `Clock`, the action insert sets `created_at` from `Clock` too, as ADR-0002 does for `updated_at`.

We kept the history intact instead of logging a correction row, because a correction would become the "current" action when another manager logged in between, and every reader would have to skip correction rows. A separate revision table would add a sixth table for a typo fix. The fix changes no decision field, no order and no count, so P3 ("newest by `id` is current", nothing lost between two managers) still holds.

The cost: the original note text is lost. `note_edited_at` shows that an edit happened, and the editor is always `created_by`. This is the §6.2 audit trigger ("edits beyond status") judged not met: author-only, note-only, 15 minutes, no compliance requirement. Build `audit_event` when compliance asks or edits widen beyond the author's own note.
````
