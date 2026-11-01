# Decisions: author can fix an action's note within 15 minutes

Requirement: "Managers sometimes log an action with a typo in its note. Let the manager who logged an action fix its note within 15 minutes of logging it."

Mode: `grill=auto` (each question answered with my recommendation), `approve=manual` (default; not exercised here, since only role 2 step 1 runs).

Grounding read before grilling: `docs/research/backend-architecture.md` §1.2 row 4, §2 (D4, D5, D15, D16, D19), §3 (P2, P3), §4.2, §4.3, §4.6, §4.7, §4.8, §4.9, §4.15, §4.16, §6.2, §7, §8; CLAUDE.md invariants; `docs/adr/0002-updated-at-set-from-clock.md`; `docs/system-design.md`; `apps/api/src/shared/schema.ts` (`vehicle_action` table exists; the `actions` module does not, since build step 5 has not started).

> **Conflicts with the baseline.** This requirement contradicts a binding invariant: CLAUDE.md "Actions are append-only; … Never update or delete them", D4 ("Append-only"), §1.2 row 4 ("nothing is ever overwritten") and P3. The deliver skill makes that a decision for the user. In `grill=auto` I answered it with my recommendation (Q1), but it is the one answer the user must confirm at the role-2 gate before roles 3–4 start. Once agreed, the same PR updates the architecture doc (see Q17).

---

## Round 1 (root of the design tree)

❓ **Q1** - **Do we allow an in-place edit of `vehicle_action.note`, as a narrow, bounded exception to the append-only rule?**

Options:

- **A. In-place `UPDATE` of `note` only, under hard limits.** Only the author, only within 15 minutes of `created_at`, only the `note` column. `action_type`, `created_by`, `created_at` and `id` stay immutable; rows are still never deleted; no new row, so "newest by `id` is current" is unchanged. Cost: the mistyped text is not kept.
- **B. Correction as a new `vehicle_action` row with `corrects_id`.** Keeps the table literally append-only, but breaks "newest by `id` is current" (a correction to an older action, made after a colleague logged a newer one, would become current), double-counts in `actionStats` and the history, and every reader (dashboard `LATERAL`, history, list `currentAction`) must filter out corrected rows.
- **C. Append-only `vehicle_action_note_revision` table;** current note = newest revision. Keeps every version, but adds a sixth table (the design fixes five), a join on every read that shows notes, and is in effect the `audit_event` alternative in §6.2.
- **D. Decline:** the manager logs a new action with the corrected note. Zero code, but the typo stays in the history and the requirement ("fix its note") is not met.

What append-only protects (P3): no lost update between two managers, and a full history of _decisions_. A preserves both: only the author can touch the row, so no colleague's write is lost, and the decision (`action_type`) can't change, so the decision history is intact. Only the author's own free text, for 15 minutes, can be replaced.

➡️ **A.** The invariant is amended, not dropped: "Actions are append-only, except that the author may replace the note within 15 minutes of logging it." Recorded as new decision **D20**, amending D4. _User decision: confirm at the gate._

---

## Round 2 (unblocked by Q1 = A)

❓ **Q2** - **Who may edit: only the action's author (`created_by = JWT sub`), whatever their role, and nobody else, not even an Admin?**

"The manager who logged" read through D15 (permissions, not roles): anyone who could log the action (Manager or Admin) may fix their _own_ note. Nobody may edit someone else's note, including Admins, since that would reintroduce the cross-user lost update P3 avoids.

➡️ Yes. Author only. Admin authors can fix their own notes; Admins cannot fix other people's.

---

❓ **Q3** - **Is the route gated by the existing `vehicle_action:create` permission (plus the author check), rather than a new permission?**

- A. Reuse `vehicle_action:create`: fixing a note you just logged is part of logging it. No change to the permission map; a user demoted to Viewer within the 15 minutes loses the ability (role is re-read per request, §4.6).
- B. New `vehicle_action:update_own_note` (one enum value + one map entry, §1.4). Clearer in the OpenAPI, but it would be granted to exactly the same roles.

➡️ A, reuse `vehicle_action:create`. The author check is the real gate; a second permission granted to the same roles adds nothing.

---

❓ **Q4** - **Only the `note` can change; `action_type` cannot?**

Changing the decision itself is a new decision, so it is a new action (D4, P3). The request body accepts only `note`; any other field (e.g. `actionType`) → `400 VALIDATION_FAILED` (unknown fields rejected, §4.8).

➡️ Yes. Note only.

---

❓ **Q5** - **Is the 15-minute window measured from `created_at`, computed in Postgres against the injected `Clock` value, with the window closed at exactly 15:00?**

- Editable while `created_at > $now - interval '15 minutes'` (strict): 14:59.999 editable, 15:00.000 closed.
- `$now` comes from `Clock` and is passed as a parameter, so tests pin it. Instant arithmetic only, no time zone involved, so the "time zones only in Postgres" rule is not touched.
- The window counts from `created_at`, not from the last edit; repeated edits do not extend it.
- Prerequisite: the actions `INSERT` must set `created_at = $now` from `Clock` (same reasoning as ADR-0002 for `updated_at`), not rely on `DEFAULT now()`; otherwise the window compares a DB clock against an injected clock and boundary tests can't be pinned.
- 15 minutes is a constant in `actions/domain/` (e.g. `NOTE_EDIT_WINDOW_MINUTES = 15`), not per-dealership config.

➡️ Yes to all of the above.

---

❓ **Q6** - **Is the edit a single conditional `UPDATE` (no lock, no transaction), with the 0-rows re-read deciding 404 / 403 / 409?**

```sql
UPDATE vehicle_action
SET note = $note, note_edited_at = $now
WHERE id = $a AND vehicle_id = $v AND dealership_id = $d
  AND created_by = $user
  AND created_at > $now - interval '15 minutes'
RETURNING *;
```

0 rows → `SELECT created_by, created_at FROM vehicle_action WHERE id = $a AND vehicle_id = $v AND dealership_id = $d`:
missing → `404`; `created_by ≠ $user` → `403`; else → `409` (window closed). The author check comes before the window check, so a non-author always gets 403. This is the same pattern as P2 and the action `INSERT`.

Two concurrent edits by the same author: last write wins. Acceptable, since it is the same person and both are within the window.

➡️ Yes.

---

❓ **Q7** - **Tenancy: non-member → 404 (guard), action ID of another vehicle or dealership → 404, and a member who isn't the author → 403?**

- Non-member: `DealershipGuard` → 404, unchanged (D16).
- `{a}` that exists but under another `{v}` or another dealership: 404, because the `WHERE` scopes on `vehicle_id` and `dealership_id`, so it is indistinguishable from missing.
- Member with `vehicle_action:create` who isn't the author: 403. The action is already readable by every member (`vehicle_action:read`), so a 404 would hide nothing; 403 tells the truth.
- Member without `vehicle_action:create` (Viewer): 403 from the guard.

➡️ Yes.

---

❓ **Q8** - **Window closed → `409` with a new code `NOTE_EDIT_WINDOW_CLOSED`, and non-author → `403 FORBIDDEN` (existing code)?**

- 409 because the request conflicts with the resource's current state (its age), like `VEHICLE_NOT_IN_STOCK` (RFC 9110 §15.5.10). 422 doesn't fit (the body is valid), and 403 would mix it up with the authorization failure.
- Non-author reuses the existing `403 FORBIDDEN` code from §4.8; a client only shows "edit" on its own actions anyway.

➡️ Yes. The Contract role (3) confirms the final codes.

---

❓ **Q9** - **The edit is allowed whatever the vehicle's status (also `RESERVED` or `SOLD`)?**

D5 limits _logging new_ actions to `IN_STOCK`. Fixing a typo makes no new decision. Within 15 minutes a status change is rare; blocking it would surprise the author and need a join to `vehicle`.

➡️ Yes, allowed in any status. No join to `vehicle`.

---

❓ **Q10** - **Any of the author's actions inside the window can be edited, not only the vehicle's current one, and any number of times?**

If a colleague logged a newer action in the meantime, the author's older action is no longer current, but its typo is still worth fixing. The window already bounds it.

➡️ Yes.

---

❓ **Q11** - **The new note follows the same rules as on create: `string` ≤ 1,000 chars, or `null` to clear it?**

Same validation as `POST …/actions` (D4) and the existing `vehicle_action_note_chk`. `null` clears a note logged by mistake; adding a note to an action that had none is also allowed. The key `note` is required in the body (an empty body → 400).

➡️ Yes.

---

❓ **Q12** - **Add one nullable column `note_edited_at timestamptz`, set from `Clock`, and expose it as `noteEditedAt` on every action read?**

Viewers can read notes (D15) and may have read the old one; an "edited" marker is the honest minimum. No `note_edited_by` column: only the author can edit, so it is always `created_by`. Existing rows migrate as `NULL` (no backfill).

➡️ Yes. The schema change makes role 3 (Contract) mandatory.

---

## Round 3 (unblocked by Q1–Q12)

❓ **Q13** - **Endpoint is `PATCH /api/v1/dealerships/{d}/vehicles/{v}/actions/{a}` with body `{note}`, returning `200` and the updated action?**

The action becomes an addressable sub-resource (the `Location` from `POST …/actions` already points at it). Statuses: 200, 400, 401, 403, 404, 409 `NOTE_EDIT_WINDOW_CLOSED`. `{a}` is the `bigint` identity; a non-integer `{a}` → 400. A `PATCH …/actions/{a}/note` sub-path or a `PUT` are the alternatives; the Contract role puts them side by side.

➡️ Yes, as above, pending the Contract role.

---

❓ **Q14** - **Nothing on the read side changes except the extra `noteEditedAt` field: "current" is still newest by `id`, the dashboard is untouched, D11 is untouched?**

No row is added or removed and `action_type` never changes, so `actionStats`, `agingWithoutAction` (D11) and "current action" give the same results. The dashboard never reads `note`. History and `currentAction` gain `noteEditedAt`.

➡️ Yes.

---

❓ **Q15** - **We deliberately do not pull the §6.2 `audit_event` trigger ("edits beyond status"), and record the lost old text as a risk?**

§6.2 lists "edits beyond status" as the trigger for an `audit_event` table. This is such an edit, but it is limited to the author's own free text for 15 minutes; `noteEditedAt` is the trace. The old text is not recoverable; add that to §8 Risks, with the `audit_event` (or Q1 option C) as the fix, and trigger "notes edited by someone other than the author, edits after the window, or compliance". Mark it in code with a `shortcut:` comment on the `UPDATE`.

➡️ Yes.

---

❓ **Q16** - **This ships as one slice, after build step 5 (Actions: `POST` and history), blocked by it?**

The `actions` module and the `vehicle_action` writer don't exist yet (only the table in `schema.ts`). The edit can't be built or tested without the `POST` that creates actions. It's one vertical slice (one column, one route, its tests), so no `to-issues` split.

➡️ Yes. One PRD issue, one slice, blocked by the step-5 Actions work. Q5's "`created_at` set from `Clock` on insert" lands in step 5 itself.

---

❓ **Q17** - **The PR updates the architecture doc and the other baseline docs, recording the change as D20 rather than a separate ADR?**

The decision amends a D-number, so it lives next to it. Edits in the same PR:

- `docs/research/backend-architecture.md`: §2 new row **D20** (author fixes note ≤ 15 min; amends D4) and D4's "Append-only" wording; §1.2 row 4; §3 P3 ("nothing is overwritten" → except D20); §4.3 `note_edited_at` column; §4.7 new `PATCH` row; §4.8 code `NOTE_EDIT_WINDOW_CLOSED`; §4.15 test rows (Q18); §7 CR3 row; §8 new risk (Q15).
- `CLAUDE.md` invariant "Actions are append-only; … Never update or delete them" → "… except D20: the author may replace the note within 15 minutes; never delete."
- `docs/system-design.md` lines on append-only actions (§ actions module, P3 bullet) and the schema table row for `vehicle_action`.
- `docs/diagrams/schema-er.*` gains the column (regenerated with `diagram-design`).

➡️ Yes. No ADR file: the D-table is the accepted-decision record for this area (`docs/agents/domain.md`).

---

❓ **Q18** - **These are the §4.15 test rows the PRD adds?**

| Rule                       | Test                                                                                                                                      | Level       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| D20 window                 | Clock pinned: edit at `created_at + 14:59.999` → 200 with `noteEditedAt`; at `+15:00.000` → 409 `NOTE_EDIT_WINDOW_CLOSED`                 | integration |
| D20 author only            | Another Manager / an Admin of the same dealership → 403; the row is unchanged                                                            | integration |
| D20 tenancy                | Non-member → 404; `{a}` under another vehicle or dealership → 404                                                                         | integration |
| D20 note only              | Body with `actionType` → 400; `note` > 1,000 → 400; `null` clears the note                                                                 | integration |
| D20 status independent     | Vehicle `SOLD` after the action → edit still 200                                                                                          | integration |
| D20 append-only otherwise  | After an edit, history has the same row count, `id`, `action_type`, `created_by`, `created_at`; current action unchanged                  | integration |
| D15/D16 RBAC               | The new route joins the route × role table                                                                                                | integration |

No new unit test: there is no pure rule beyond a constant; the window lives in SQL.

➡️ Yes.

---

Frontier empty: every branch visited (conflict, actor, permission, field scope, window, race, tenancy, errors, status, multiplicity, validation, schema, endpoint, read side, audit, slicing, docs, tests).
