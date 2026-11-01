# Decisions: author fixes an action's note within 15 minutes

Requirement: "Managers sometimes log an action with a typo in its note. Let the manager who logged an action fix its note within 15 minutes of logging it."

Mode: `grill=auto` (each question answered with the recommended answer), `approve=manual` (default; not exercised, since only role 2 step 1 ran). Role 1 did not run in this evaluation, so there is no research note; the questions draw on `docs/research/backend-architecture.md` (§1.2, §2 D4/D5/D11/D15/D16/D19, §3 P2/P3, §4.3, §4.6–§4.8, §4.15, §6.2), `docs/adr/0002`, `CLAUDE.md` invariants and `apps/api/src/shared/schema.ts`.

---

### Q1. The requirement contradicts the append-only rule. Which way?

D4 ("Append-only; the latest is current"), §1.2 row 4 ("nothing is ever overwritten"), P3 and the CLAUDE.md invariant ("Actions are append-only … Never update or delete them") forbid changing a logged action. Editing a note changes one. Per the skill, this is a **decision for the user**.

- **A.** Narrow exception: the action's author may overwrite its `note` in place within 15 minutes. `action_type`, `created_by`, `created_at` and `id` stay immutable; rows are never deleted.
- **B.** Keep the table strictly append-only: a fix is a new "correction" row pointing at the original (`corrects_id`).
- **C.** Keep `vehicle_action` untouched and add a `vehicle_action_note_revision` table; readers join the latest revision.

**Answer (recommended, grill=auto): A.** What append-only protects is the decision history and "newest by `id` is current" (P3: no lost update between two managers). A note fix by its own author changes neither: no row is added or reordered, the type, author and time stay, and only one person can write the field. B breaks "newest by `id` is current" (a correction logged after another manager's action would become "current") and makes every reader (list `LATERAL`, dashboard, history, D11 count) filter correction rows out. C adds a sixth table against the five-table design for a typo fix. Recorded as **ADR-0005**, which supersedes D4 in part; D4's row in the frozen doc is marked accordingly.

_Confirm at the role 2 gate: this is the user's call, taken here only because `grill=auto`._

### Q2. Is the original (typo'd) note text kept anywhere?

§6.2's Audit row defers an `audit_event` table with the trigger "Compliance, or edits beyond status", and a note edit is an edit beyond status, so the trigger has to be addressed.

- **A.** Overwrite; mark the row with a nullable `note_edited_at timestamptz` so readers can see it was edited.
- **B.** Keep the first text in an `original_note` column.
- **C.** Build the `audit_event` table from §6.2 now.

**Answer: A.** The edit is author-only, note-only and limited to 15 minutes; the old text is by definition a mistake its own author is fixing. `note_edited_at` keeps the fact of the edit visible (D19 audit trail stays `created_by/created_at`, and the editor is always `created_by`, so no `updated_by` is needed). The §6.2 trigger is judged not met: no compliance requirement, and the edited field carries no decision. The code carries a `shortcut:` comment: original note text is not kept; add `audit_event` when compliance asks or edits widen beyond the author's own note.

### Q3. Who may fix a note: which permission, and which rule?

D15: guards check permissions, never role names. "The manager who logged it" is a row-level rule (authorship), not a role.

- **A.** Reuse `vehicle_action:create` on the route; the SQL adds `created_by = $currentUser`.
- **B.** New permission `vehicle_action:update`, granted to ADMIN and MANAGER, plus the authorship check.
- **C.** No permission, authorship check only.

**Answer: A.** Today the roles that may fix a note are exactly the roles that may log one, so a second permission with identical grants is an option nobody asked for. Keeping the permission check (not C) means a user demoted to VIEWER inside the 15 minutes loses the right at once, because `DealershipGuard` re-reads the role on every request. Applies to ADMIN too (any role holding `vehicle_action:create`), since the rule is "the person who logged it".

### Q4. Status codes when the caller may not fix this note (tenancy, 404 vs 403)?

**Answer:**

- Not a member of the dealership → `404` from `DealershipGuard` (D16), unchanged.
- Member without `vehicle_action:create` (VIEWER) → `403 FORBIDDEN` from the guard.
- Action id not found, or it belongs to another vehicle or another dealership → `404 NOT_FOUND`. The `UPDATE` and the re-read are scoped by `id`, `vehicle_id` and `dealership_id`.
- Action exists in this dealership but was logged by someone else → `403 FORBIDDEN`. The caller can already read the action (`vehicle_action:read`), so a `404` would hide nothing and only confuse.

### Q5. How is "within 15 minutes" measured, and is the boundary inclusive?

**Answer:** compare instants, not dates: `created_at >= $now - interval '15 minutes'` in SQL, with `$now` from the injected `Clock` passed as a parameter. No time zone is involved (both values are `timestamptz` instants), so the "time zones only in Postgres" rule holds trivially and Node does no time arithmetic. Inclusive: an edit at exactly 15:00.000 after logging is accepted, one later is rejected. The 15 minutes is a fixed constant, not a per-dealership setting (nobody asked for one).

Follow-on: `vehicle_action.created_at` today defaults to the database's `now()`, while the window check uses `Clock`. If the insert used the default, a test that pins `Clock` could not place an action inside or outside the window. So the action insert (build step 5) sets `created_at` from `Clock` explicitly, the same reasoning as ADR-0002. Folded into ADR-0005.

### Q6. How is the write made race-free?

CLAUDE.md: conditional SQL, not locks; 0 rows → re-read.

**Answer:** one statement, no transaction:

```sql
UPDATE vehicle_action
SET note = $note, note_edited_at = $now
WHERE id = $a AND vehicle_id = $v AND dealership_id = $d
  AND created_by = $userId
  AND created_at >= $now::timestamptz - interval '15 minutes'
RETURNING *;
```

0 rows → `SELECT created_by FROM vehicle_action WHERE id = $a AND vehicle_id = $v AND dealership_id = $d`: no row → `404`; `created_by <> $userId` → `403 FORBIDDEN`; otherwise the window has closed → `409 NOTE_EDIT_WINDOW_CLOSED` (a state conflict, §4.8). Only the `actions` module writes `vehicle_action` (§4.2).

### Q7. Can the note be fixed after the vehicle became RESERVED or SOLD?

D5 allows logging only on `IN_STOCK` vehicles (`409 VEHICLE_NOT_IN_STOCK`).

**Answer: yes, regardless of vehicle status.** D5 governs new decisions; a typo fix records no new decision, and the 15-minute window already bounds it. So the `UPDATE` does not join `vehicle` and never returns `VEHICLE_NOT_IN_STOCK`.

### Q8. What may change: type, clearing the note, adding a missing note?

**Answer:** only `note`. Body `{ note }`, a required string of 1–1,000 characters (the same `≤ 1000` CHECK as on create, D4); unknown fields such as `actionType` → `400 VALIDATION_FAILED` (§4.8 rejects unknown fields). A different action type is a new decision and goes through `POST …/actions` as today. Clearing (null or empty) is rejected: the requirement is fixing a typo, not deleting a note. An action logged without a note may get one inside the window: the same statement covers it and rejecting it would need an extra branch for no stated reason.

### Q9. Does a note fix touch "current action", the dashboard or the KPIs (derived aging, D10–D12)?

**Answer: no.** `id` and `created_at` do not change, so "newest by `id` is current" and history order are unchanged. The dashboard reads only `action_type` from the latest action, so KPIs, `actionStats` and D11 "aging with no action" are unaffected. Aging stays derived from `stocked_on`; nothing here stores a tier. The list query's `LATERAL` already selects `la.note`, so the fixed text shows up on the next poll (D9).

### Q10. Concurrency: what if two fixes, or a fix and a new action, race?

**Answer:** two fixes can only come from the same author (two tabs); the last `UPDATE` wins, which is that person's latest intent. No `If-Match` (deferred in §6.2 with its trigger). A fix and a new action touch different rows and never conflict; P3 still holds (both actions persist, newest is current).

### Q11. What changes in the schema and API, and does role 3 (Contract) run?

**Answer:** one nullable column `vehicle_action.note_edited_at timestamptz` (existing rows stay `NULL`, a new migration after `0000_init`, per ADR-0001), surfaced as `noteEditedAt` on action responses (history, create, and the list's `currentAction`). One new endpoint, recommended `PATCH /api/v1/dealerships/{d}/vehicles/{v}/actions/{a}` with `{note}` → `200` action; statuses `200, 400, 403, 404, 409 NOTE_EDIT_WINDOW_CLOSED`. Because the work adds an endpoint and a column, **role 3 runs**; the exact shape is settled there.

### Q12. Which docs move with the change (Doc impact for the implementation PR)?

**Answer:** in this step: `docs/adr/0005-…` (new), `docs/adr/README.md` (index row), D4's row in `docs/research/backend-architecture.md` (marked partly superseded, the only edit the frozen doc allows), `GLOSSARY.md` (new: Action, Current action, Note, Author, Note edit window). Left for the implementation PR: the CLAUDE.md invariant "Never update or delete them" (narrow it to point at ADR-0005), `docs/system-design.md` (actions module line and `vehicle_action` table row), `docs/diagrams/schema-er` (new column), §4.7-style route table in the OpenAPI output, and the §4.15-style test rows (window boundary at 15:00 inclusive / 15:00.001 rejected with a pinned `Clock`; non-author → 403; other vehicle or dealership → 404; VIEWER → 403; vehicle SOLD after logging → still 200; `actionType` in body → 400; current action and dashboard counts unchanged after a fix; D15/D16 route × role table gains the new route).
