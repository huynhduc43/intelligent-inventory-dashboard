# Retro: PR #17 / issue #6 (skeleton)

Source: `inputs/pr17-record.md` (the only primary source). Followed `mattpocock-skills` `retro` 1.3.1 (`skills/engineering/retro/SKILL.md`) after loading `writing-for-agents`. Checked against the sandbox's `.claude/skills/deliver/SKILL.md`, `.claude/agents/*.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `eslint.config.mjs`, `apps/api/vitest.config.ts`, `.husky/*` and `.github/workflows/ci.yml`.

What went right: both reviewers caught real mistakes in r1, one fix round cleared all three, r2 came back clean, and the Tester passed. The guardrails exist and run (pre-commit lint-staged, pre-push typecheck + unit tests, CI `format:check lint typecheck test:cov`), so a missing guardrail is not a finding.

None of these candidates is applied. Each needs the user's go; approved ones go in one `chore/` PR.

Candidates, most severe first.

## 1. The Contract agent wrote a design that broke a CLAUDE.md invariant (major, Coding standards / Navigation)

**What happened.** The contract asked for an application-set `updated_at` "via Drizzle `$onUpdate`". The `Chosen:` comment kept it ("rest as drafted"), the implementer built it as written (`$onUpdate(() => sql\`now()\`)`), and only the code reviewer saw that it breaks "`now` comes from the injected `Clock`". The defect entered at role 3, not role 4.

**Why.** The Contract agent's prompt in `SKILL.md` §3 reads the issue, §4.3/§4.6/§4.7/§4.8 and CONTRIBUTING's naming table. It never reads the CLAUDE.md **Invariants that are easy to get wrong**, which the Architect (role 2) and both reviewers do.

**Change.** In `.claude/skills/deliver/SKILL.md` §3 step 1, add the invariants to the agent's reading list:

```diff
-Its prompt: read the issue and §4.3, §4.6, §4.7 and §4.8 of `docs/research/backend-architecture.md` and the naming table in `CONTRIBUTING.md`; draft the contract
+Its prompt: read the issue, §4.3, §4.6, §4.7 and §4.8 of `docs/research/backend-architecture.md`, the ADRs in `docs/adr/`, the **Invariants that are easy to get wrong** in `CLAUDE.md` and the naming table in `CONTRIBUTING.md`; draft the contract
```

## 2. `$onUpdate` is a mechanical violation with no deterministic check (major, Automated checks)

**What happened.** Same defect as 1. ADR 0002 now forbids Drizzle `$onUpdate` for `updated_at`, but nothing stops it coming back: only a reviewer reading the diff would see it.

**Why it is a check, not a rule.** It is a fixed syntactic pattern (one method name), so per `retro` it gets a lint rule, not reviewer prose. The repo already runs ESLint with zero warnings in the pre-commit hook (lint-staged), in CI and in `pnpm verify`.

**Change.** In the main rules block of `eslint.config.mjs`:

```js
'no-restricted-syntax': [
  'error',
  {
    selector: 'CallExpression[callee.property.name=/^\\$onUpdate(Fn)?$/]',
    message: 'Set updatedAt from the injected Clock in the owning service (ADR 0002).',
  },
],
```

Its other half is a judgement call, so it goes to the reviewer: ADR 0002 says "every writer of `vehicle` must remember to set the column", and raw-SQL conditional `UPDATE`s cannot be linted. Extend the existing line in `.claude/agents/deliver-code-reviewer.md` step 2:

```diff
-   - time-zone maths in Node instead of Postgres, or `now` read inside SQL instead of passed from the injected `Clock`;
+   - time-zone maths in Node instead of Postgres, `now` read inside SQL instead of passed from the injected `Clock`, or an update of `vehicle` that leaves `updated_at` unset (ADR 0002);
```

## 3. The Tester invented a `pass (via test)` verdict (moderate, Information access / completion criterion)

**What happened.** Two of the six criteria (`statement_timeout`, `Clock`) cannot be seen through the API. The Tester marked them "pass (via test)" and returned `pass`. `deliver-tester.md` only knows `curl` evidence, so the verdict depended on the agent improvising, and it is not clear whether it ran those tests or trusted the implementer's Evidence.

**Change.** Add to `.claude/agents/deliver-tester.md` step 2:

```md
A criterion the API cannot show (a database setting, the `Clock`) is marked `pass (via test)` only when you ran the test that proves it in this worktree; the evidence is the test name and its output.
```

Optional upstream fix: in the Architect's spec step, tag each acceptance criterion `API` or `test` so the Tester knows the branch before it starts.

## 4. CONTRIBUTING caches the coverage exclude list, and the cache drifted (minor, No-ops / single source of truth)

**What happened.** Business-review r1 found `src/shared/schema.ts` excluded in `apps/api/vitest.config.ts` but not in CONTRIBUTING.md. The fix copied the new entry into CONTRIBUTING, so the two lists can drift again on the next exclusion.

**Change.** In CONTRIBUTING.md **Tests and coverage**, replace the list with a pointer and the rule that the config cannot show:

```diff
-`main.ts`, `*.module.ts` and `src/shared/schema.ts` (declarations only; its migration is checked by the DB integration test) are excluded.
+Only files with no logic are excluded, in `coverage.exclude` of `apps/api/vitest.config.ts`, each with a one-line comment there saying why.
```

Then add those one-line comments in `vitest.config.ts` (the reasons now in CONTRIBUTING move there).

## 5. "Deviations" wording let a spec difference pass as an "implementation note" (minor, Coding standards)

**What happened.** The implementer named the PK `user_dealership_user_id_dealership_id_pk` instead of the contract's `user_dealership_pkey`, filed it as an "implementation note" under "Deviations: None from the spec", and baked the name into a test. The business reviewer caught it, as designed. The fix added a test that every PK is `<table>_pkey`, so this exact case is now guarded.

**Why.** `deliver-implementer.md` says the Deviations section "lists each decision that changed the spec". A difference the implementer did not see as a decision falls outside that sentence.

**Change.** In `.claude/agents/deliver-implementer.md` **The spec**:

```diff
-The PR body's **Deviations** section lists each decision that changed the spec, with that link.
+The PR body's **Deviations** section lists every difference from the spec, each with the link to the decision that allowed it.
```

## 6. Under `approve=auto` no human took any hard-to-reverse decision (question for the user)

**What happened.** `grill=auto` and `approve=auto` meant the agent picked the three contract options (schema: `updated_by NOT NULL`, `numeric(12,2) CHECK >= 0`, plain FK) and the decisions that later became ADRs 0001–0004. The AI log's "Human decisions" column for #17 reads "None". The late ADRs are already fixed: since #20 the Architect writes ADRs on the branch while grilling. What remains is who decides schema choices.

1. When `approve=auto`, what happens at the Contract gate when the contract changes a table or permission?
   - A. Nothing changes: the agent takes its recommendation, and the AI log records it.
   - B. The Contract gate always waits for the user when the contract has a schema or permission change, even in `approve=auto`.
   - C. The agent goes on but posts the choices and asks for a review before the Checkpoint.

   Recommendation: **B**. A schema choice costs a migration to undo after merge; the other gates stay automatic.

## Not assessed

The record has no tool-call log, so Navigation and Tool economy (how long the agents spent finding files, expensive calls) cannot be judged for this session.
