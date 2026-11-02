# AI collaboration log

How the AI was directed, checked and corrected while building this project. The strategy is summarised in the README (**AI Collaboration Narrative**) and the design-phase story in [`system-design.md`](system-design.md) §8; this file is the evidence behind both.

Every entry links to an issue, PR or comment, so a claim here can be checked against the record. It logs the moments that show judgement, not every prompt.

**Tools.** Claude Code (Claude Opus) does the work, driven by the `/deliver` skill and its role agents in `.claude/`. ChatGPT was used once as a second opinion on the workflow (case C6). The skills come from `mattpocock-skills` (research, grilling, domain modeling, spec, tickets, TDD, code review, PR, retro), `diagram-design` and `ponytail` (lazy, anti-over-engineering review).

## How to add an entry

`/deliver` adds one at its **Finish** step; any other session that directs or corrects the AI adds one the same way, in the same PR.

1. One row in **By PR**: PR, what it did, what the AI did, how it was verified, what a human decided.
2. One case in **Cases** for each moment worth a reviewer's time: a review finding or Tester failure that caught an agent's mistake, a `decision-needed`, an `Amended:` comment, a proposal the user rejected or changed. Use the fields below and link the source. `Decided by` is `user`, or `agent (approve=auto)` / `agent (grill=auto)` when the workflow let the agent take its own recommendation.

```md
### C<n>: <title> (#<PR>)

- **Problem:** what had to be decided or what went wrong.
- **AI proposal:** what the agent proposed or built.
- **Decided by:** user | agent (mode).
- **Decision and reasoning:** what was chosen and why.
- **Verification:** the test, review comment or transcript that settled it.
- **Outcome:** what changed (code, ADR, rule).
```

## By PR

| PR                                                                           | What                                                               | What the AI did                                                                                                                                             | Verification                                                                                                              | Human decisions                                                                                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [#1](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/1)   | Architecture research (`docs/research/backend-architecture.md`)    | Extracted the brief, researched primary sources, drafted decisions over four revisions, cut to one buildable MVP                                            | Every decision traced to a brief requirement (§7); sources linked inline                                                  | 14 of 19 decisions (D-rows marked **U**); 5 are AI assumptions (C1); the scope cut was the agent's call                                    |
| [#2](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/2)   | Workspace, standards, health check, `AgingPolicy`                  | Scaffolded Turborepo + NestJS, lint, hooks, CI, coverage gate                                                                                               | `pnpm verify`; 100% coverage on `domain/**`                                                                               | None: the agent decided                                                                                                                    |
| [#3](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/3)   | `/deliver` skill and role agents                                   | Wrote the seven-role workflow                                                                                                                               | First used on #6 (#17)                                                                                                    | None: the agent decided                                                                                                                    |
| [#5](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/5)   | Auth moved to build step 2                                         | Reordered §4.16 and split the seed across steps                                                                                                             | `pnpm verify`                                                                                                             | None: the agent decided                                                                                                                    |
| [#16](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/16) | System Design Document                                             | Condensed the architecture doc; drew three diagrams                                                                                                         | Each diagram rendered and read before commit                                                                              | Diagram tool (C2)                                                                                                                          |
| [#17](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/17) | Skeleton: config, Drizzle, migrations, readiness, Compose (#6)     | `/deliver` end to end: decisions, contract, implementation, two reviewers, tester                                                                           | 2 review rounds, 3 findings fixed (C3–C5); tester walked 6 criteria against the running Compose stack, all pass           | None: decisions (`grill=auto`) and contract choices were the agent's recommendations                                                       |
| [#18](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/18) | ER diagram in the design doc                                       | Drew the schema diagram from #6                                                                                                                             | Rendered and read                                                                                                         | —                                                                                                                                          |
| [#19](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/19) | ADRs 0001–0004 for #6                                              | Recorded four hard-to-reverse decisions                                                                                                                     | —                                                                                                                         | Written after #17 merged, which exposed doc drift (C6)                                                                                     |
| [#20](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/20) | `/deliver` keeps docs in sync, logs AI collaboration               | Audited the repo against the brief, compared two workflow proposals, changed the skill and agents, evaluated the change against a frozen baseline           | `pnpm verify`; six-step eval, 94% vs 68% for the old skill (C7)                                                           | Four workflow decisions (C6); keep the sub-skills, fix three findings without rerunning (C7)                                               |
| [#21](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/21) | This log, README narrative, design doc §8, Status fixes            | Rebuilt the history above from GitHub                                                                                                                       | Every row links its source                                                                                                | Log format                                                                                                                                 |
| [#23](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/23) | Problem+json errors and request-scoped pino logging (#7)           | Implemented the filter, logging and tests; fixed nine review findings in one round                                                                          | `pnpm verify`; two review rounds plus a body-only round; Tester passed AC 1–6 against the running API                     | None: the agent decided (`grill`/`approve` manual, no `decision-needed`)                                                                   |
| [#24](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/24) | Retro fixes from #23 | Applied retro candidates 1–3: orchestrator edits PR bodies, hooks load Node 24, a supersession mark | Retro proposals only; applied after the user's go | The user approved the fixes and waived the `/deliver` eval rerun (see C11) |
| [#25](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/25) | Auth: login, JWT, dealership guards, permissions, `/me`, seed (#8) | `/deliver` end to end under `grill=auto`/`approve=auto`: research note, 15 decisions, ADRs 0008–0009, contract, implementation, three review rounds, tester | `pnpm verify` (153 tests); three review rounds, 8 findings fixed (C9, C10); Tester passed AC 1–11 against the running API | None: decisions and contract choices were the agent's recommendations (`approve=auto`); the user chose the modes and the implementer model |
| [#26](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/26) | Retro fixes from #25 | Applied five retro proposals: `format:check` in pre-push, `verify` output as Evidence, two reviewer rules, `pnpm install` after `git worktree add`, `engine-strict` | `pnpm verify` | The user approved all five (C12) |

## Cases

### C1: Design decisions are labelled user or AI (#1)

- **Problem:** the brief is ambiguous (what "age" counts from, what "real-time" means, who may log actions) and asks for assumptions to be documented.
- **AI proposal:** a decision table (D1–D19) drafted from the brief and primary sources, each row marked **U** (user decision) or **A** (AI assumption), with the AI-filled details inside user rows called out (e.g. D3 "U (bounds A)").
- **Decided by:** user for the 14 **U** rows; the 5 **A** rows (D2, D11, D17, D18, D19) stayed assumptions. Cutting revision 4 to one buildable MVP was the agent's call.
- **Decision and reasoning:** the assumptions are surfaced, not buried: they are listed in `system-design.md` §6 for the reviewer.
- **Verification:** §7 of the architecture doc traces each brief requirement (CR1–CR3, REST, tests) to its design and code location.
- **Outcome:** later steps cite decisions by number; the reviewers check PRs against them.

### C2: Diagrams with `diagram-design`, not Mermaid (#16)

- **Problem:** the System Design Document needs an architecture diagram.
- **AI proposal:** Mermaid blocks in the Markdown.
- **Decided by:** user.
- **Decision and reasoning:** use the `diagram-design` skill instead: an HTML source per diagram, exported to SVG and embedded as an image.
- **Verification:** whoever renders a diagram reads a scaled copy of the image before publishing and checks it shows what it claims (`/deliver` ground rules).
- **Outcome:** `docs/diagrams/*.{html,svg}`; the rule is in the agents' memory and in `CONTRIBUTING.md` **Doc impact**.

### C3: Reviewer caught a timestamp that tests could not pin (#17)

- **Problem:** `vehicle.updated_at` needed a value on every update.
- **AI proposal:** the contract asked for an application-set `updated_at`; the implementer used Drizzle `$onUpdate(() => sql\`now()\`)`.
- **Decided by:** reviewer finding, fixed by a fresh implementer; recorded as an `Amended:` comment on #6.
- **Decision and reasoning:** the independent code reviewer showed the failure: a schema callback cannot reach the injected `Clock`, so a test pinning time cannot assert `updatedAt`, which breaks the CLAUDE.md invariant that `now` comes from `Clock`. Each service update sets `updatedAt: clock.now()` instead.
- **Verification:** [code-review r1](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/17) finding on `schema.ts:105`; fixed in `92c22c6`; r2 clean.
- **Outcome:** [ADR 0002](adr/0002-updated-at-set-from-clock.md).

### C4: "None from the spec" that was a spec deviation (#17)

- **Problem:** the contract declared `PRIMARY KEY (user_id, dealership_id)`, which Postgres names `user_dealership_pkey`.
- **AI proposal:** Drizzle's default name `user_dealership_user_id_dealership_id_pk`, listed by the implementer as an "implementation note" under "Deviations: None from the spec", with a test that baked the odd name in.
- **Decided by:** reviewer rule (every difference from the spec is a finding unless recorded).
- **Decision and reasoning:** build the spec: name the key `user_dealership_pkey`.
- **Verification:** [business-review r1](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/17); fixed in `92c22c6` with a new test asserting every PK is `<table>_pkey`.
- **Outcome:** the implementer's own summary is treated as a claim to check, not a record.

### C5: Coverage gate and documented rule disagreed (#17)

- **Problem:** the PR excluded `src/shared/schema.ts` from coverage, but `CONTRIBUTING.md` listed only `main.ts` and `*.module.ts`.
- **AI proposal:** the exclusion, without updating the standard.
- **Decided by:** reviewer finding, accepted.
- **Decision and reasoning:** keep the exclusion (declarations only; the migration generated from it is checked by an integration test) and document it.
- **Verification:** [business-review r1](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/17) Standards finding; fixed in `92c22c6`.
- **Outcome:** `CONTRIBUTING.md` **Tests and coverage** matches `vitest.config.ts`.

### C6: Docs drifted from code; workflow changed to keep them in sync (#20, #21)

- **Problem:** the ADRs for #6 were written in a separate PR after the code merged (#19); README's Status still said the database was not built; the design doc lacked the GenAI section the brief requires, and the README lacked the AI Collaboration Narrative; `/deliver` read skills from an unversioned folder outside the repo.
- **AI proposal:** the agent audited the repo against the brief and found the gaps above, then compared two workflow proposals: ChatGPT's (a `requirements.md`, `business-rules.md`, ADRs, an AI collaboration log, a plan-before-code prompt) and the `mattpocock-skills` main flow (grill-with-docs → to-spec → to-tickets → implement with TDD and code review → PR → retro). It recommended keeping `/deliver`'s extra roles, adopting grill-with-docs, to-spec/to-tickets and retro, and rejecting the ChatGPT parts that clash with the design: separate requirements and business-rules files (a fifth source of truth), "use transactions for multi-step mutations" (the design prefers conditional SQL, P2) and CSV import in scope (deferred, §6).
- **Decided by:** user, four numbered questions.
- **Decision and reasoning:** (1) log AI collaboration in this file, summarised in the README; (2) the architecture doc is frozen, new decisions are ADRs, `system-design.md` shows the current state; (3) adopt grill-with-docs and to-spec/to-tickets; (4) run retro after every PR, proposals only, applied after the user's go.
- **Verification:** `pnpm verify`; the next `/deliver` run is the real test.
- **Outcome:** #20 (workflow: **Doc impact** in every PR, business reviewer checks it, Finish appends to this log) and #21 (the missing sections, Status fixes, this log).

### C7: `/deliver` change measured, not assumed (#20)

- **Problem:** #20 rewired `/deliver` (new sub-skills, Doc impact, ADRs, AI log, retro) with nothing showing it worked better than before, or that each sub-skill it calls earns its place.
- **AI proposal:** run six `/deliver` steps in sandbox clones in three configurations: the new skill, the old one frozen byte-for-byte as a baseline, and the new one with every sub-skill call replaced by a plain instruction. Result: new 94%, old 68%, no sub-skills 85% over 46 assertions; no regression; `to-spec` and `retro` measurably help; `grilling` + `domain-modeling`, `tdd`, `ponytail-review` and `code-review` showed no effect. The runs also raised five findings about the skill itself, the first being that `grill=auto` let the agent override an invariant (D4) with nobody confirming.
- **Decided by:** user, two numbered questions (1C, 2A).
- **Decision and reasoning:** (1C) keep the four "not shown" sub-skills and do not evaluate them further: the cases were not built to isolate them, so "not shown" is not "useless". (2A) fix findings 1–3 in #20 without rerunning the evals: a conflict with the design stops for the user in every mode, the spec carries `## Acceptance criteria`, the Contract agent reads the CLAUDE.md invariants and ADRs. Findings 4 (`vehicle_action.created_at` from `Clock`) and 5 (spec-time scope creep) stay open.
- **Verification:** [`.claude/evals/deliver/REPORT.md`](../.claude/evals/deliver/REPORT.md) with per-run grading in `iteration-1/`; the fixes in `fff5a4f` are not measured, and the report says so.
- **Outcome:** CLAUDE.md requires an eval rerun against the baseline for any `/deliver` change, waivable by the user; the finish fixture and one implementer assertion need fixing before the next iteration.

### C8: A log filter that hid unknown paths, and a PR body that contradicted the diff (#23)

- **Problem:** `isHealthProbe` matched the URL prefix `/health/`, so `GET /health/nope` returned a 404 problem whose `instance` had no log line (Decision 6, Contract §4). The Implementer's first pass also raised Nest to `^12.3.2` against Decision 0 (`^12.0.2`), left `customProps` unwired and the "one line per request" test unasserted, and left ADR 0005's supersession of `ValidationPipe` out of the docs.
- **AI proposal:** match by URL prefix; both reviewers independently found it.
- **Decided by:** agent (reviewer findings accepted; no user decision needed).
- **Decision and reasoning:** decide from the matched route (`req.route.path`) instead of the URL, so only the real health routes are silent.
- **Verification:** [code-review r1](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/23#discussion_r4438361199) and [business-review r1](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/23#discussion_r4438359932); fixed in `85344b9` with a `/health/no-such` test. The PR body still claimed `^12.3.2` after the fix; the business reviewer caught that in round 2 and the orchestrator edited the body.
- **Outcome:** health-only silence, docs marked superseded, version floor restored. The Implementer cannot edit PR bodies, so body findings are fixed by the orchestrator.

### C9: A review fix left "disabled users cannot log in" resting on a random secret (#25)

- **Problem:** round 1 asked that disabled users verify against the dummy hash, as Decision 8 says. The fix routed them to `verifyDummy` but kept the refusal check as `!user || !ok`, so a disabled user was refused only because their password did not match a random dummy password. Both reviewers returned `clean` on that head.
- **AI proposal:** the orchestrator read the business reviewer's side note ("the login code no longer checks the user's status directly"), checked the code, and posted a finding: refuse on `user?.status !== 'ACTIVE'`, with a test that stubs `verifyDummy` to return `true`.
- **Decided by:** agent (approve=auto).
- **Decision and reasoning:** an authorization rule must not depend on a secret staying unguessed; the explicit status check costs one condition.
- **Verification:** [review comment](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/25#discussion_r4438659029); test `refuses a disabled user even when the dummy check passes`, which returns 200 under the old check.
- **Outcome:** `auth.service.ts` checks status explicitly; round 3 clean from both reviewers.

### C10: Unformatted docs and a PR body that undersold the diff (#25)

- **Problem:** the orchestrator committed the research note and ADR index without running Prettier (it had no `node_modules` in the new worktree yet), so `format:check` failed in CI while the PR claimed `pnpm verify` passed. The PR's **Doc impact** also said "ADRs: none" although the PR adds ADRs 0008 and 0009, the glossary and the research note. Failed logins were not logged at `warn` (§5.1), and the seed step was missing from the setup docs.
- **AI proposal:** the business reviewer posted five findings in round 1; the orchestrator rewrote **Doc impact**, the Implementer fixed the rest.
- **Decided by:** agent (approve=auto).
- **Decision and reasoning:** all five were fixed as posted; none changed a decision.
- **Verification:** [business review r1](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/25#issuecomment-6568241510) and its inline threads, resolved in 730d6f6; round 2 clean.
- **Outcome:** formatted docs, `warn` log line on failed login with a test, seed step in `docs/environment-setup.md`, README and `.env.example`.

### C11: Retro after #23 applied as proposals, one skipped (#24)

- **Problem:** the retro on #23 found that body-only review findings had no owner, that git hooks ran on Node 23 (the shell is non-interactive and ignores `.nvmrc`), and that a diagram label still named the superseded `ValidationPipe`.
- **AI proposal:** four candidates, none applied without a go. Candidate 4 (grep the docs for superseded terms) was marked "only pays off if supersessions become frequent".
- **Decided by:** user (applied candidates 1–3, skipped 4, waived the `/deliver` eval rerun that CLAUDE.md otherwise requires).
- **Decision and reasoning:** cheap, local fixes now; the eval rerun was not worth its cost for three one-line rule changes.
- **Verification:** the PR body states the waiver under **Deviations**.
- **Outcome:** `/deliver` has the orchestrator fix body-only findings and rerun only the commenting reviewer; `docs/environment-setup.md` documents `~/.config/husky/init.sh`; the architecture diagram label is marked superseded.

### C12: The implementer's "verify passed" was wrong; retro fixes after #25 (#26)

- **Problem:** the Implementer reported `pnpm verify` green on #25 while `format:check` failed, and the failure surfaced only in CI because `pre-push` skipped `format:check`. The reviewers missed C9, and a fresh worktree had no `node_modules`, so Prettier and the hooks did not run on the first commit. The shell was on Node 23 while `crypto.argon2` needs ≥ 24.7.
- **AI proposal:** five retro proposals, ordered by severity: `format:check` in pre-push; the Implementer pastes the tail of `pnpm verify` into **Evidence**; two reviewer rules (a remark about a security property is a finding, and a fix to a branching flow re-checks every refusal condition); `pnpm install` right after `git worktree add`; `engine-strict` to make a wrong Node fail loudly.
- **Decided by:** user ("fix issue từ retro"): all five applied.
- **Decision and reasoning:** each closes a gap where a claim went unchecked. For the fifth, `engines` (`>=24.7`) and the Husky init (C11) already existed, so only `.npmrc` `engine-strict=true` was added.
- **Verification:** `pnpm verify`; the reviewer rules are not exercised yet, and the `/deliver` evals were not rerun (see the PR).
- **Outcome:** `.husky/pre-push`, `.npmrc`, `deliver-implementer`, both reviewer agents, `/deliver` SKILL.md and `docs/environment-setup.md`.
