# Decisions: correct an action's note within 15 minutes

Requirement: "Managers sometimes log an action with a typo in its note. Let the manager who logged an action fix its note within 15 minutes of logging it."

Mode: `grill=auto` (each answer is the Architect's recommendation, taken as the answer). Role 2 step 1 only. The questions run in rounds; each round asks only questions whose prerequisites earlier rounds have settled.

Sources read: `CLAUDE.md`, `CONTRIBUTING.md`, `docs/agents/domain.md`, `docs/adr/README.md` and ADR-0001 to ADR-0004, `docs/research/backend-architecture.md` §1.1, §1.2, §2 (D4, D5, D11, D15, D16, D19), §3 (P2, P3), §4.2, §4.3, §4.6–§4.8, §4.15, §4.16, §6.2, §6.4, `docs/system-design.md` (actions mentions), `apps/api/src/shared/schema.ts` (`vehicle_action`), `apps/api/src/shared/clock.ts`. No `GLOSSARY.md` existed; no research note exists (role 1 was not run in this evaluation).

---

## Round 1 (root)

### Q1. The requirement contradicts D4 and the append-only invariant. How do we resolve it?

D4 says actions are append-only. CLAUDE.md says "Never update or delete them". §1.2 row 4 says "nothing is ever overwritten". Fixing a note changes a logged row, so this is a conflict with the baseline, and per the skill a decision for the user, recorded as an ADR that supersedes D4.

- **A.** Supersede D4 in part: only the `note` column becomes correctable, only by the action's author, only within 15 minutes. `action_type`, `created_by`, `created_at`, `vehicle_id` and `id` stay immutable; a changed decision is still a new action. Recorded as ADR-0005.
- **B.** Keep strict append-only: a "correction" is a new action with the same type and the fixed note. It becomes current even when another manager logged an action in between (wrong current action), the typo stays in the history next to the fix, and it needs an `IN_STOCK` vehicle (D5).
- **C.** Keep rows immutable and add a note-revision table: preserves every version, but a sixth table (CLAUDE.md: five tables) and a join on every action read, for an audit nobody asked for.

**Answer: A.** It is the smallest change that does what was asked. It keeps the property D4 and P3 exist for, that a changed *decision* never overwrites an earlier one, and narrows the exception to a typo fix by the author shortly after logging. Written as `docs/adr/0005-author-may-correct-action-note-for-15-minutes.md`, listed in `docs/adr/README.md` with "Supersedes: D4 (in part)", and D4 is marked superseded in part in `backend-architecture.md` (the only edit the frozen doc allows).

---

## Round 2 (depends on Q1 = A)

### Q2. What can a correction change?

**Answer:** the `note` only. `action_type` cannot change: a different type is a different decision and is logged as a new action (D4, P3). Glossary: **Note correction** vs **Action**.

### Q3. Which note values are accepted?

**Answer:** the same rule as on create (D4): a string of at most 1,000 characters, or `null` to clear it, with the same DTO validation (`400 VALIDATION_FAILED`, unknown fields rejected). Sending the note it already has is a successful no-op (`200`), not a `409`: there is no state to conflict with, unlike same-state status transitions.

### Q4. Who may correct a note?

**Answer:** only the action's **author**, the user in `created_by` (the JWT `sub`). An Admin who logged an action is its author and may correct it. No one may correct another user's note, Admins included: the requirement says "the manager who logged" it, and an override would let one user rewrite another's words without trace. Glossary: **Author**.

### Q5. Which permission guards the route?

The rule is permissions, never roles (D15).

- **A.** A new permission `vehicle_action:update`, granted to ADMIN and MANAGER in `auth/domain/permissions.ts`.
- **B.** Reuse `vehicle_action:create`.

**Answer: A.** The guard should name what the route does, and the D15/D16 route × role test is driven by the permission table. Under B, `create` would mean two things. A user demoted to VIEWER within the window loses the right either way (`403`). The author check (Q4) is in the SQL on top of the permission, not in place of it.

### Q6. How is "within 15 minutes of logging" measured?

**Answer:** elapsed time from `created_at` to `now`, where `now` is the injected `Clock`'s instant passed into SQL as a parameter, compared in the conditional `UPDATE`: `created_at >= $now - interval '15 minutes'`. Inclusive: at exactly 15:00.000 the correction is allowed, at 15:00.001 it is not. This is not calendar-day maths, so the dealership time zone plays no part and Node does no time arithmetic; minute-only intervals subtracted from a `timestamptz` do not depend on the session time zone (only the `day` part of an interval does). The 15 minutes is one constant in `actions/domain/`, not per-dealership configuration (nobody asked for a setting). Glossary: **Correction window**.

### Q7. Is the vehicle's status relevant?

**Answer:** no. D5 limits *logging* an action to `IN_STOCK` vehicles. A correction logs nothing; it fixes the text of a past decision. A note can be corrected after the car was reserved or sold within the window.

### Q8. Only the current action, or any of the author's actions?

**Answer:** any action by the author still inside the correction window, current or not. The current action is the newest by `id`, and a correction does not change `id`, so it never changes which action is current. No index change: the `UPDATE` hits the primary key.

### Q9. How is tenancy enforced?

**Answer:** the route is nested under the vehicle, `…/dealerships/{d}/vehicles/{v}/actions/{a}`, and the `UPDATE` matches `id = $a AND vehicle_id = $v AND dealership_id = $d`. A non-member gets `404` from `DealershipGuard` before the handler runs (D16). An action id that belongs to another vehicle or another dealership is `404`, the same as a missing one, so it leaks nothing.

---

## Round 3 (depends on Q4–Q9)

### Q10. How is the write made race-free?

**Answer:** one conditional statement, no lock, no transaction (the P2 pattern):

```sql
UPDATE vehicle_action SET note = $note
WHERE id = $a AND vehicle_id = $v AND dealership_id = $d
  AND created_by = $user AND created_at >= $now - interval '15 minutes'
RETURNING *
```

0 rows → re-read the action by `(id, vehicle_id, dealership_id)` and classify in this order: missing → `404`; `created_by ≠ $user` → `403`; otherwise the window has closed → `409`. A correction sent at 14:59.999 that commits later is still judged on `$now` from `Clock` at request time, which is the instant the user acted.

### Q11. Which status and problem codes?

**Answer (for the Contract role to confirm):**

- `200` with the action.
- `400 VALIDATION_FAILED` for a bad body.
- `403 FORBIDDEN` when the member lacks `vehicle_action:update`.
- `403 NOT_ACTION_AUTHOR` when the action belongs to someone else. This is `403` and not `404` because the user can already read that action (`vehicle_action:read`); hiding it would not protect anything. A distinct code lets the client tell this apart from a missing permission.
- `404 NOT_FOUND` for a missing action, or one under another vehicle or dealership.
- `409 CORRECTION_WINDOW_CLOSED` once the 15 minutes have passed. A state conflict (RFC 9110 §15.5.10), as with `INVALID_TRANSITION`.

### Q12. What does `created_at` need for the window to be testable?

The schema has `vehicle_action.created_at DEFAULT now()`. A test that pins `Clock` cannot place both ends of the window if the database sets the start.

**Answer:** the action insert (build step 5, not yet built) sets `created_at` from `Clock`, the ADR-0002 pattern, keeping the `DEFAULT` only as a fallback for seeds. Recorded under ADR-0005 **Consequences**. No migration is needed.

### Q13. Do we keep the old text or mark the note as corrected?

- **A.** No: the corrected note replaces the old one; no flag, no history.
- **B.** Add a nullable `note_corrected_at` column so the history can show "edited".
- **C.** Keep each prior version (see Q1 C).

**Answer: A.** The requirement asks only for the fix. The author bound and the 15-minute window limit the loss to the author's own fresh typo, and D19's audit (`created_by`/`created_at`) still says who logged it and when; the corrector can only be that same author. B or C are the upgrade once someone needs to see corrections; §6.2's `audit_event` table is that trigger ("compliance, or edits beyond status"). Recorded in ADR-0005 **Consequences**. No schema change.

### Q14. What happens under concurrent writes?

**Answer:**
- The author sends two corrections at once: both pass the `WHERE`, and the last to commit wins. It is the same user fixing the same text, so no `If-Match` (deferred in §6.2).
- A correction racing with another manager logging a new action: independent rows; the new action becomes current, as P3 says.
- A correction racing with the vehicle being sold: independent; status does not matter (Q7).

### Q15. Which reads and rules change?

**Answer:** none of the queries. The list's `currentAction`, the detail, the history and the dashboard read `note` from the row, so they show the corrected text. A correction is not an action: it does not change "aging with no action" (D11), `actionStats` counts or the current action. Aging stays derived (D1, D2); nothing here touches `stocked_on`.

### Q16. What is the API shape?

**Answer (for the Contract role to confirm):** `PATCH /api/v1/dealerships/{d}/vehicles/{v}/actions/{a}`, body `{ "note": string | null }`, `@RequirePermission('vehicle_action:update')`, response the action as `GET …/actions` returns it. `PATCH` because it changes one field of an existing resource. No `Location` header.

### Q17. What do the docs need?

**Answer:** in this step: ADR-0005, its README row, the D4 supersession mark, and `GLOSSARY.md` (all written in the sandbox). The implementing PR then updates, under **Doc impact**: the CLAUDE.md invariant line ("Actions are append-only … Never update or delete them" becomes "append-only except a note correction by the author within 15 minutes, ADR-0005"), `docs/system-design.md` (the `actions` module and the write paths), the §4.6 permission table as reflected in `system-design.md`, and `docs/diagrams/` where a diagram shows action writes. No step outside the repo: no env var and no migration.

---

## Round 4

Frontier empty. Every branch is settled: what changes (Q2, Q3), who (Q4, Q5), when (Q6, Q12), where (Q7–Q9), how it is written (Q10, Q14), what it returns (Q11, Q16), what it leaves alone (Q13, Q15), and which docs follow (Q17). In `grill=auto`, that ends step 1.

## Invariants probed

| Invariant (CLAUDE.md) | Outcome |
| --- | --- |
| Actions are append-only | Superseded in part by ADR-0005 (Q1, Q2) |
| Tenancy, 404 vs 403 | Non-member and foreign action → 404; non-author member → 403 (Q9, Q11) |
| Time zones only in Postgres; `now` from `Clock` | Window is elapsed instant time in SQL with `$now` from `Clock`; no TZ maths (Q6, Q12) |
| Race-free conditional writes | One conditional `UPDATE`, 0 rows → re-read → 404/403/409 (Q10, Q14) |
| Derived aging | Untouched (Q15) |
| Permissions, never roles | New `vehicle_action:update` (Q5) |
