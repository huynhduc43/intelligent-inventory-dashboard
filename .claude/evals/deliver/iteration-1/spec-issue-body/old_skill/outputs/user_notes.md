# User notes

- **Seams (to-prd "check with the user"):** took the recommended single seam, the HTTP API in integration tests with `Clock` overridden. No unit seam, because every rule sits in one SQL statement.
- **Decisions 7-11 are mine, not from the grill.** They are marked as such in `spec.md` and need confirming at the role 2 gate:
  - 7: without a "current action only" rule, correcting an older action after a colleague logged a newer one makes the old action current again (newest by `id` wins). Added 409 `ACTION_SUPERSEDED`. The other way out, redefining "current", would touch the list, detail and dashboard queries.
  - 8: the corrections point at the root action, so correcting a correction cannot extend the 15 minutes.
  - 9: the correction copies `action_type`, and the body is `{note}` only (1-1,000 chars).
  - 10: the order of 404 / 403 / 409 checks on re-read. Decision 2 on its own reads as "anything not missing -> 409 `CORRECTION_WINDOW_CLOSED`", which clashes with decisions 3 and 4.
  - 11: `vehicle_action.created_at` defaults to the DB's `now()` in `schema.ts`. Comparing it with `Clock` `$now` would make pinned-clock window tests meaningless, so every action insert writes `created_at = $now` (same idea as ADR 0002).
- **Known race documented, not solved:** a newer action committed at the same moment can slip past the supersession check (READ COMMITTED). I marked it as a `shortcut:`-style known limit.
- **Dependency:** the `actions` module (build step 5) does not exist yet, so this PRD is blocked by it. I did not create a blocker issue.
- **Title style unverified:** there is no remote and `gh` was not reachable, so I could not compare with existing issue titles.
- **Doc inconsistency noticed, not changed:** `schema.ts` says the append-only rule is D19, but the architecture doc puts it under D4.
- Skipped per task: role 1 research, the grill, diagrams, publishing, slices, gate.
