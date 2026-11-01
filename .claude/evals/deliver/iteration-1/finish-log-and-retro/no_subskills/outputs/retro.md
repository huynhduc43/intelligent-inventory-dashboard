# Retro: PR #17 / issue #6 (Skeleton)

Source: `inputs/pr17-record.md` (1 Implementer round, reviewers r1 open → r2 clean, Tester r2 pass, 1 `Amended:`, all gates taken under `approve=auto` / `grill=auto`).

Already fixed since #17, so **not** proposed again (checked against the sandbox repo):

- Business reviewer treats **Deviations** as a claim and every spec difference as a finding (`deliver-business-reviewer.md` step 3).
- Code reviewer checks "`now` read inside SQL instead of passed from the injected `Clock`" (`deliver-code-reviewer.md` step 2).
- `CONTRIBUTING.md` **Tests and coverage** lists the `schema.ts` exclusion.
- ADRs written as decisions are made, plus **Doc impact** in every PR (#20, case C6).
- The PK naming rule is enforced by `db.spec.ts` "names every primary key <table>_pkey".

Candidates, most severe first. None applied: each needs the user's go; approved ones go in one `chore/` PR.

## R1 (major): the contract prescribed a mechanism that breaks an invariant

- **What happened:** the Contract agent asked for `updated_at` via Drizzle `$onUpdate`. A schema callback cannot reach the injected `Clock`, so the spec itself broke the CLAUDE.md rule "`now` comes from the injected `Clock`". The implementer built what the spec said, the code reviewer caught it in r1, and fixing it took a round plus an `Amended:` on #6 (later ADR 0002).
- **Root cause:** the role 3 agent prompt reads §4.3/§4.6–§4.8 and CONTRIBUTING naming only. It never reads the CLAUDE.md invariants, so nothing upstream of review checks the contract against them.
- **Proposal:** `.claude/skills/deliver/SKILL.md` §3 step 1, in the agent prompt after "the naming table in `CONTRIBUTING.md`": add "and the **Invariants that are easy to get wrong** in CLAUDE.md; for each column whose value the app sets (timestamps, `*_by`), say where the value comes from (`Clock`, the JWT subject), and never name an ORM or DB mechanism that breaks an invariant."

## R2 (minor): the implementer can still write "implementation notes" and tests that copy the code's output

- **What happened:** the PK came out with Drizzle's default name, the PR called it an "implementation note" under "Deviations: None from the spec", and the catalog test asserted the wrong name. The reviewer side is fixed; the implementer's instructions still allow the same thing.
- **Proposal:** `.claude/agents/deliver-implementer.md`:
  - **The spec**, after the Deviations sentence: "Any difference from the chosen contract, however small, is a deviation and goes through `decision-needed:`. The PR body has no 'implementation notes'."
  - **Build** step 3: "Take each expected value in a test (names, types, statuses, codes) from the contract, never from what the code produced."

## R3 (minor): Tester criteria that the API cannot show are handled ad hoc

- **What happened:** 2 of 6 criteria were "pass (via test)" (`statement_timeout`, `Clock`). The runbook only covers time-of-day and DST criteria, so the tester improvised the label.
- **Proposal:**
  - `.claude/skills/deliver/api-runbook.md` **Drive the API**, last bullet: widen to "Criteria the running app cannot show (time of day, DST, DB session settings such as `statement_timeout`, a pinned `Clock`): cite the integration test and its result, mark the row `pass (via test)`."
  - `SKILL.md` §2 step 3 (Spec): each acceptance criterion says how it is observed, through the API or through a named test, so the Tester and the Implementer's **Evidence** agree from the start.

## R4 (minor): constraint names are not in the naming table

- **What happened:** Drizzle's composite-key default (`<table>_<cols>_pk`) differs from Postgres's (`<table>_pkey`). The test now catches it, but the rule is written nowhere an implementer reads before coding.
- **Proposal:** `CONTRIBUTING.md` **Naming**, new row: `Constraints | Postgres defaults (<table>_pkey, <table>_<col>_fkey); name Drizzle composite keys explicitly`.

## R5 (minor): Finish step 2 assumes the PR branch is still open

- **What happened:** the #17 log entry was written after the merge (in #21), and this Finish run also happens after the merge. "Commit it to the PR branch and push" has no branch to go to.
- **Proposal:** `SKILL.md` **Finish** step 2: "When the PR is already merged, put the entry in its own `docs/<N>-ai-log` PR."

## R6 (low): auto-mode decisions are not surfaced to the user

- **What happened:** under `approve=auto` every gate (contract `Chosen: A for all three`, the `Amended:` on `updated_at`) was the agent's call, and the log's "Human decisions" for #17 reads "None". Nothing tells the user which choices to review before merging.
- **Proposal:** `SKILL.md` **Finish** step 4: in `approve=auto`, the report lists each gate choice and `Amended:` comment the agent took, with its link.

## Considered and dropped

- A check that `vitest.config.ts` coverage excludes match `CONTRIBUTING.md`: the business reviewer's Standards axis already caught it, and the two are in sync now. A script would be more machinery than the problem.
