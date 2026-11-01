# /deliver evaluation, iteration 1 (2026-11-01)

Does the `/deliver` change in PR #20 do what it promises, without breaking what worked? And does each sub-skill it calls earn its place? Six steps of `/deliver` were each run once in three configurations, in isolated sandbox clones, with no GitHub writes:

| Configuration  | What it is                                                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `with_skill`   | `/deliver` as changed by PR #20                                                                                                                          |
| `old_skill`    | the baseline: `/deliver` and the files PR #20 changes, as of `origin/dev` before it ([`skill-snapshot/`](skill-snapshot/), base commit in `BASE_COMMIT`) |
| `no_subskills` | PR #20's `/deliver` with every sub-skill call replaced by a plain instruction ([`variants/no-subskills/`](variants/no-subskills/))                       |

Test cases (prompt, fixtures, graders) are in [`.claude/skills/deliver/evals/`](../../skills/deliver/evals/); outputs, grading and timing per run are in [`iteration-1/`](iteration-1/); [`iteration-1/review.html`](iteration-1/review.html) shows them side by side.

## Results

46 assertions over 6 cases. Pass rate: **new 94%**, old 68%, no sub-skills 85%.

| Step (case)                                               | Sub-skill removed in `no_subskills` | New | Old | No sub-skills |
| --------------------------------------------------------- | ----------------------------------- | --- | --- | ------------- |
| Architect: grill (`architect-grill-append-only-conflict`) | `grilling` + `domain-modeling`      | 7/7 | 5/7 | 7/7           |
| Architect: spec (`spec-issue-body`)                       | `to-spec` (old: `to-prd`)           | 8/8 | 8/8 | 5/8           |
| Implementer (`implementer-validate-thresholds`)           | `tdd` (old: `implement`)            | 6/7 | 6/7 | 7/7           |
| Code reviewer (`code-review-planted-defects`)             | `ponytail-review`                   | 8/8 | 7/8 | 8/8           |
| Business reviewer (`business-review-planted-gaps`)        | `code-review`                       | 8/8 | 5/8 | 8/8           |
| Finish (`finish-log-and-retro`)                           | `retro`                             | 6/8 | 0/8 | 4/8           |

Cost: the new version takes about 50 s and 14k tokens more per step than the old one (+28% time, +18% tokens).

## What PR #20 changed, measured

- **Decisions go to ADRs, not the frozen doc.** Given a requirement that breaks append-only actions (D4), the new skill wrote ADR 0005, a GLOSSARY.md and a one-line "superseded" marker on D4. The old skill wrote nothing and planned to rewrite the D-table and ten sections of `backend-architecture.md` in the PR.
- **Reviewers catch doc and decision drift.** The new business reviewer flagged the missing **Doc impact** and said an unrecorded change to D5 needs a superseding ADR; the old one did neither. The new code reviewer flagged an unjustified dependency; the old one did not.
- **Finish records and learns.** The new Finish corrected the AI log against the record (decisions attributed to the agent under `approve=auto`) and ran a retro with a concrete ESLint rule against `$onUpdate`, applying nothing. The old Finish only reports.
- **Nothing regressed.** Every invariant check that passed under the old skill passed under the new one (tenancy, `db` vs `tx`, time zones in Node, weakened tests, 403 vs 404).

## Does each sub-skill earn its place?

| Sub-skill                      | Effect measured                                                                                                                                                                | Verdict                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `to-spec`                      | Without it the spec lost user stories, test seams and out-of-scope (8/8 → 5/8). The old `to-prd` did as well as `to-spec`.                                                     | **Needed.** The swap from `to-prd` is quality-neutral; its gain is that it is versioned in the plugin. |
| `retro`                        | Without it the retro proposed only prose changes (no deterministic check) and missed the late-ADR gap (6/8 → 4/8).                                                             | **Needed.**                                                                                            |
| `grilling` + `domain-modeling` | None: without them the grill still found the conflict, wrote ADR 0005 and GLOSSARY.md, because `/deliver` and CLAUDE.md already ask for both. The glossary format was guessed. | Not shown.                                                                                             |
| `tdd`                          | None: all three ran red before green. Without it, one big red→green instead of slices.                                                                                         | Not shown.                                                                                             |
| `ponytail-review`              | None on the planted defects; all three found the same seven issues.                                                                                                            | Not shown.                                                                                             |
| `code-review`                  | None; with and without it the business reviewer found every planted gap.                                                                                                       | Not shown.                                                                                             |

"Not shown" is not "useless": these cases were built to test what PR #20 changed, and their assertions do not isolate those four skills (most pass in every configuration). Removing them needs a case designed to separate them first.

## Findings about the skill itself

Raised by the runs, independent of the configuration:

1. **`grill=auto` let the agent override an invariant.** All three grills chose an in-place `UPDATE` that supersedes D4, flagged "confirm at the gate", and went on. In `approve=auto` nobody confirms. A conflict with an invariant should stop for the user in every mode.
2. **The spec has no `## Acceptance criteria`.** `to-spec`'s template has none, yet the Tester and code reviewer read acceptance criteria from the issue. Only the no-sub-skills run added the section.
3. **The Contract role never reads the CLAUDE.md invariants.** Both retros traced `$onUpdate` (#17) to the contract asking for it.
4. **`vehicle_action.created_at` defaults to the database's `now()`.** Every run that touched the 15-minute window found that pinned-Clock tests need it set from `Clock`, as ADR 0002 does for `updated_at`. Relevant to issue #11.
5. **Spec-time scope creep.** Both skill-backed spec runs added 5–7 decisions beyond the grill's six; only the no-sub-skills run raised its gaps as A/B/C questions instead.

## Limits of this iteration

- One run per configuration: no variance estimate.
- Finish fixture flaw: the sandbox log already held the #17 row and cases C3–C5, so two "adds" assertions could not pass for the new skill or the no-sub-skills variant. Both correctly corrected the existing entries instead.
- The implementer's scope assertion ("at most a doc line") penalised the new skill for updating two stale docs, which its Doc impact rule asks for.
- A harness hook blocked subagents from writing `.md` files; five runs returned their output as text, saved by the orchestrator (`old_skill` business review and all three code reviews, the latter condensed).

## Next iteration

Fix the finish fixture and the implementer scope assertion; add assertions that separate `grilling`/`domain-modeling`, `tdd`, `ponytail-review` and `code-review` from plain instructions; run each configuration three times.
