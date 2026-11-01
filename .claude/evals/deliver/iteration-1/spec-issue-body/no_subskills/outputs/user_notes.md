# User notes

## Where I departed from the skill, and why

- **Only step 3 ran.** Steps 1 (grill, GLOSSARY.md, ADR file), 2 (diagram), 4 (slices) and 5 (gate) did not run, and neither did the worktree setup, as the task said. So `docs/adr/0005-*.md` does not exist in the sandbox. The spec cites ADR-0005 because decision 6 says it is recorded; under the full flow, step 1 would have written it in the worktree.
- **No issue was created and nothing was published** (dry run). Under the full flow: `gh issue create --title "$(cat title.txt)" --body-file spec.md --label ready-for-agent`. The diagram publishing and the `## Diagrams` edit were skipped; the placeholder stays.
- **Sections I added beyond the ones the skill lists.** I added `## Requirement`, which names the step 5 dependency, and `## Acceptance criteria`. The skill names `## Decisions`, `## Diagrams`, `## Design refs` and a testing section. But the code reviewer, the tester and the implementer's Evidence section all read "acceptance criteria" from the issue, so the spec needs them. The testing section is `## Tests`.
- **Decisions copied word for word** from `decisions.md`, so the issue's `## Decisions` matches the grill record.

## Things I derived that the decisions do not say outright (check at the gate)

1. **The correction copies `action_type`** from the original. Decision 5's body is only `{note}`, and decision 1 makes the correction the current action, so it has to carry the type, or the current type would be lost.
2. **Which error wins when a check fails.** Decision 2 says "otherwise 409 `CORRECTION_WINDOW_CLOSED`", but decisions 3 and 4 add 403 and a second 409. The spec does not fix an order. I suggest the re-read checks run as 404 → 403 `NOT_ACTION_AUTHOR` → 409 `VEHICLE_NOT_IN_STOCK` → 409 `CORRECTION_WINDOW_CLOSED`. The Contract role (role 3) should settle this.
3. **The window bound is inclusive** (`<= 15 minutes`), so the tests use +15:00 → 201 and +15:01 → 409.
4. **`note` is required, up to 1,000 characters (D4).** Whether an empty string, which would clear the note, is allowed is not decided.

## Open questions the grill did not settle (I would raise these at the gate)

1. **A correction of an action that is no longer current.** Say manager A logs PROMOTION, manager B then logs AUCTION, and A fixes the PROMOTION note within 15 minutes. By decision 1 the correction becomes the newest row, so it displaces B's AUCTION as current. That quietly reverses a colleague's action, which is what P3 avoids.
   - A: allow a correction only while `{a}` (or its latest correction) is still the current action; otherwise 409 (new code).
   - B: allow it anyway, and the correction becomes current.
   - C: change "current" so that corrections never displace a later action. This touches list, detail and dashboard queries.
   - Recommendation: **A**, as one more condition in the same conditional `INSERT`.
2. **Correcting a correction.** If `{a}` can be a correction row, the window restarts each time, and an author could keep a note editable forever.
   - A: `{a}` must be an original (`corrects_action_id IS NULL`). Repeated fixes each target the original, and the window always counts from the original.
   - B: allow chains, with the window measured from the root action.
   - Recommendation: **A**.
3. **The clock source of `created_at`.** `vehicle_action.created_at` is `DEFAULT now()` in `apps/api/src/shared/schema.ts`, but the window compares it with `$now` from `Clock`. Tests can still pin the window by seeding the original with an explicit `created_at` (that is how the test row is written). Consider setting the action's `created_at` from `Clock`, in the spirit of ADR-0002, so the two sides use the same clock.

## Labels

The only label is `ready-for-agent`. The spec is meant for the `deliver-implementer` agent after the Contract role, and the repo defines no type labels (`docs/agents/triage-labels.md`). I am not certain of this, though. Since the manual gate has not passed and the Contract has not been chosen yet, `needs-triage` could also be defended.
