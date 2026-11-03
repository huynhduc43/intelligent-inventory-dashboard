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

| PR                                                                           | What                                                                                    | What the AI did                                                                                                                                                                                                                  | Verification                                                                                                                        | Human decisions                                                                                                                                                             |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#1](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/1)   | Architecture research (`docs/research/backend-architecture.md`)                         | Extracted the brief, researched primary sources, drafted decisions over four revisions, cut to one buildable MVP                                                                                                                 | Every decision traced to a brief requirement (§7); sources linked inline                                                            | 14 of 19 decisions (D-rows marked **U**); 5 are AI assumptions (C1); the scope cut was the agent's call                                                                     |
| [#2](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/2)   | Workspace, standards, health check, `AgingPolicy`                                       | Scaffolded Turborepo + NestJS, lint, hooks, CI, coverage gate                                                                                                                                                                    | `pnpm verify`; 100% coverage on `domain/**`                                                                                         | None: the agent decided                                                                                                                                                     |
| [#3](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/3)   | `/deliver` skill and role agents                                                        | Wrote the seven-role workflow                                                                                                                                                                                                    | First used on #6 (#17)                                                                                                              | None: the agent decided                                                                                                                                                     |
| [#5](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/5)   | Auth moved to build step 2                                                              | Reordered §4.16 and split the seed across steps                                                                                                                                                                                  | `pnpm verify`                                                                                                                       | None: the agent decided                                                                                                                                                     |
| [#16](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/16) | System Design Document                                                                  | Condensed the architecture doc; drew three diagrams                                                                                                                                                                              | Each diagram rendered and read before commit                                                                                        | Diagram tool (C2)                                                                                                                                                           |
| [#17](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/17) | Skeleton: config, Drizzle, migrations, readiness, Compose (#6)                          | `/deliver` end to end: decisions, contract, implementation, two reviewers, tester                                                                                                                                                | 2 review rounds, 3 findings fixed (C3–C5); tester walked 6 criteria against the running Compose stack, all pass                     | None: decisions (`grill=auto`) and contract choices were the agent's recommendations                                                                                        |
| [#18](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/18) | ER diagram in the design doc                                                            | Drew the schema diagram from #6                                                                                                                                                                                                  | Rendered and read                                                                                                                   | —                                                                                                                                                                           |
| [#19](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/19) | ADRs 0001–0004 for #6                                                                   | Recorded four hard-to-reverse decisions                                                                                                                                                                                          | —                                                                                                                                   | Written after #17 merged, which exposed doc drift (C6)                                                                                                                      |
| [#20](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/20) | `/deliver` keeps docs in sync, logs AI collaboration                                    | Audited the repo against the brief, compared two workflow proposals, changed the skill and agents, evaluated the change against a frozen baseline                                                                                | `pnpm verify`; six-step eval, 94% vs 68% for the old skill (C7)                                                                     | Four workflow decisions (C6); keep the sub-skills, fix three findings without rerunning (C7)                                                                                |
| [#21](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/21) | This log, README narrative, design doc §8, Status fixes                                 | Rebuilt the history above from GitHub                                                                                                                                                                                            | Every row links its source                                                                                                          | Log format                                                                                                                                                                  |
| [#23](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/23) | Problem+json errors and request-scoped pino logging (#7)                                | Implemented the filter, logging and tests; fixed nine review findings in one round                                                                                                                                               | `pnpm verify`; two review rounds plus a body-only round; Tester passed AC 1–6 against the running API                               | None: the agent decided (`grill`/`approve` manual, no `decision-needed`)                                                                                                    |
| [#24](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/24) | Retro fixes from #23                                                                    | Applied retro candidates 1–3: orchestrator edits PR bodies, hooks load Node 24, a supersession mark                                                                                                                              | Retro proposals only; applied after the user's go                                                                                   | The user approved the fixes and waived the `/deliver` eval rerun (see C11)                                                                                                  |
| [#25](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/25) | Auth: login, JWT, dealership guards, permissions, `/me`, seed (#8)                      | `/deliver` end to end under `grill=auto`/`approve=auto`: research note, 15 decisions, ADRs 0008–0009, contract, implementation, three review rounds, tester                                                                      | `pnpm verify` (153 tests); three review rounds, 8 findings fixed (C9, C10); Tester passed AC 1–11 against the running API           | None: decisions and contract choices were the agent's recommendations (`approve=auto`); the user chose the modes and the implementer model                                  |
| [#26](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/26) | Retro fixes from #25                                                                    | Applied five retro proposals: `format:check` in pre-push, `verify` output as Evidence, two reviewer rules, `pnpm install` after `git worktree add`, `engine-strict`                                                              | `pnpm verify`                                                                                                                       | The user approved all five (C12)                                                                                                                                            |
| [#28](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/28) | OpenAPI export, `/docs`, curl examples and README scaffolding (#27, part of #15)        | `/deliver` under `grill=auto`/`approve=auto`: stopped on the build-order conflict, research note, ADR 0010, diagram, implementation, two review rounds, tester                                                                   | `pnpm verify`; two review rounds, 4 findings fixed (C14); Tester passed AC 1–4 against the running API                              | The user chose the sequencing and the `@nestjs/swagger` dependency (C13); the rest were the agent's recommendations (`approve=auto`)                                        |
| [#30](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/30) | Vehicle list and detail with derived age and tier, vehicle seed (#9)                    | `/deliver` under `grill=auto`/`approve=auto`: research note, stopped on the §4.2/§4.4 conflict, ADR 0011, 18 decisions, diagrams, contract, implementation, three review rounds, tester                                          | `pnpm verify` (212 tests); three review rounds, 7 findings fixed (C16, C17); Tester passed AC 1–13 against the running API          | The user chose the cross-table read (C15); the rest were the agent's recommendations (`approve=auto`)                                                                       |
| [#39](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/39) | Dashboard KPI summary and breakdowns (#10)                                              | `/deliver` under `grill=auto`/`approve=auto`: no research needed, 9 decisions, glossary terms, diagram, contract, implementation, two review rounds, tester                                                                      | `pnpm verify` (225 tests); two review rounds, 6 findings fixed (C19, C20); Tester passed AC 1–3 against the running API (C21)       | None: decisions and the contract were the agent's recommendations (`approve=auto`, C22); the user chose the modes and the implementer model                                 |
| [#44](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/44) | Retro fixes from #39                                                                    | Applied the three retro candidates: `pnpm install` must exit 0 with a `node_modules` symlink fallback under the cooldown, the lockfile in pnpm 12's form plus a CI image build, a test name per acceptance criterion in Evidence | `pnpm verify`; `docker build` reproduced the failure, then passed with the cooldown off in a throwaway Dockerfile                   | The user approved all three and waived the `/deliver` eval rerun                                                                                                            |
| [#46](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/46) | CI red on `dev` for four pushes; agents never looked                                    | Re-resolved three packages under the release-age cooldown; `verify` runs `install --frozen-lockfile`; agents watch PR checks after every push; `/deliver` fixes the lockfile instead of symlinking `node_modules` (C23)          | `pnpm verify`; CI on the PR                                                                                                         | The user asked why no agent caught it, and waived the `/deliver` eval rerun (C23)                                                                                           |
| [#47](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/47) | Log and list vehicle actions, seeded action history (#11)                               | `/deliver` under `grill=auto`/`approve=auto`: research note, 12 decisions, ADR 0013, glossary terms, two diagrams, contract, implementation, two review rounds, tester                                                           | `pnpm verify`; two review rounds, 10 findings fixed (C23, C24); Tester passed AC 1–5 and the seed criterion against the running API | None: decisions, the contract choice and the seed amendment were the agent's recommendations (`approve=auto`, C23, C25); the user chose the modes and the implementer model |
| [#56](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/56) | Spec diagrams move from the `assets` branch into `docs/diagrams/specs/`                 | Copied the 22 files, rewrote the `/deliver` publishing rule to commit diagrams on the PR branch and link them by commit permalink, removed `tools/push-assets.sh`                                                                | `pnpm verify`; moved PNGs match the `assets` branch                                                                                 | The user chose the move and kept spec diagrams out of the design doc; waived the `/deliver` eval rerun (C27)                                                                |
| [#59](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/59) | Vehicle intake: `POST …/vehicles` with VIN rules (#12)                                  | `/deliver` under `grill=auto`/`approve=auto`: research note, 9 decisions, glossary terms, diagram, contract, implementation on sonnet, three review rounds, tester                                                               | `pnpm verify`; three review rounds, 8 findings fixed (C28–C30); Tester passed AC 1–13 against the running API                       | None: decisions and the contract were the agent's recommendations (`approve=auto`, C31); the user chose the modes and the implementer model                                 |
| [#66](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/66) | Vehicle status lifecycle: `PATCH …/vehicles/{v}/status` (#13)                           | `/deliver` under `grill=auto`/`approve=auto`: no research note (the design settled it), 7 decisions, glossary terms, two diagrams, contract, implementation on sonnet, two review rounds, tester                                 | `pnpm verify`; two review rounds, 4 findings fixed (C33, C34); Tester passed AC 1–11 against the running API                        | None: decisions and the contract choice were the agent's recommendations (`approve=auto`, C32); the user chose the modes and the implementer model                          |
| [#79](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/79) | Dealership settings: `GET`/`PATCH …/settings` (#14)                                     | `/deliver` under `grill=auto`/`approve=auto`: research note, 12 decisions, ADRs 0014 and 0015, glossary term, two diagrams, contract, implementation on sonnet, two review rounds, tester                                        | `pnpm verify`; two review rounds, 8 findings fixed (C37, C38); Tester passed AC 1–12 against the running API                        | The user chose where `validateThresholds` lives (C35), the modes and the implementer model; the other decisions were the agent's (C36)                                      |
| [#87](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/87) | Retro follow-ups #81–#83: evidence check, lock-wait helper, CI gate before review       | Diagnosed why three rules recurred after #61, #70 and #68, built a red-capable loop for each, replaced prompt rules with a script, a test helper and an orchestrator step                                                        | `pnpm verify`; each check goes red on #79's recorded failure and green on the fix (C39)                                             | The user asked for the root cause, and waived the `/deliver` eval rerun                                                                                                     |
| [#90](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/90) | Curl examples for every route, `db:explain` and README `EXPLAIN ANALYZE` evidence (#15) | `/deliver` under `grill=auto`/`approve=auto`, implementer on Sonnet: research note with a real 20k seed, spec in #15, a script that replays the services' own SQL under `EXPLAIN (ANALYZE, BUFFERS)`                             | 1 fix round, 6 findings (C40, C41); tester walked AC 1–5 on a fresh 20k seed, all pass                                              | PNG export setup (C43) and reviewer GitHub write permission (C42); everything else the agent decided                                                                        |
| [#98](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/98) | Request and 2xx response bodies are named, linked OpenAPI components (#97)              | `/deliver` under `grill=auto`/`approve=auto`, research, diagram and contract roles skipped as unneeded; probed zod `.meta({ id })` before writing the spec; ADR 0016; implementer on Sonnet                                      | 1 fix round, 1 finding (C45); tester checked AC 1–7 on a live `/docs-json`, all pass                                                | The user asked for the fix and allowed skipping roles; the agent decided the rest (C44)                                                                                     |

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

### C13: #15 asked for before the routes it documents exist (#28)

- **Problem:** the user asked to do #15 (build step 7) first, but its criteria cover every §4.7 route and `EXPLAIN ANALYZE` of queries that #9–#14 have not built yet. That contradicts the §4.16 build order, which `/deliver` treats as a decision for the user even under `auto`.
- **AI proposal:** three options: A, build #9–#14 first (recommended); B, do the route-independent scaffolding now and finish #15 later; C, reorder with an ADR. It also asked about the new dependency.
- **Decided by:** user (chose B and approved `@nestjs/swagger`).
- **Decision and reasoning:** the reviewer can browse and diff the API earlier; later slices only append routes. #15 was split into #27 (now) and the remainder (after #14), recorded in an `Amended:` comment on #15.
- **Verification:** issue #15 comment, #27 Decisions 1–2.
- **Outcome:** sub-issue #27, ADR 0010, #15 stays open.

### C14: Over-documented responses and a committed export that Prettier had rewritten (#28)

- **Problem:** round 1 found that the committed `openapi.json` had been reformatted by Prettier, so re-running the export changed it and the parsed-object drift test could not notice. The global 400/401 responses also appeared on health routes and `/me`, and login lacked its 429.
- **AI proposal:** the Implementer built `addGlobalResponse` for 400/401/500, as the research note accepted, and compared parsed objects in the drift test.
- **Decided by:** agent (`approve=auto`): fixes as the reviewers recommended.
- **Decision and reasoning:** a generated file must stay byte-exact, so it joined `.prettierignore`; error responses are declared per route, with only 500 global.
- **Verification:** code review comments r1 (export layout, global responses) and the business review comment; a new per-route status test; round 2 clean.
- **Outcome:** `.prettierignore`, `docs.ts`, `auth.controller.ts`, `openapi.spec.ts`; `docs/system-design.md` §2.1.

### C15: The design contradicted itself on who reads `vehicle_action` (#30)

- **Problem:** §4.2 says only `dashboard` reads across tables, but §4.4/§4.7 give the `inventory` list a `LATERAL` join on `vehicle_action` for `currentAction` and `hasAction`.
- **AI proposal:** stop under `grill=auto` (a design conflict is always the user's) and offer A) keep the §4.4 read-only join and narrow the rule in an ADR, B) attach actions after paging, C) move list/detail into `dashboard`; recommended A, because B breaks `hasAction` with paging.
- **Decided by:** user.
- **Decision and reasoning:** A. One query keeps `total` and pages correct; `inventory` imports nothing from `actions`, so the module graph is unchanged.
- **Verification:** [issue #9 Decision 1](https://github.com/huynhduc43/intelligent-inventory-dashboard/issues/9); ADR 0011.
- **Outcome:** ADR 0011, §4.2 marked superseded, CLAUDE.md module rule, `system-design.md` and the architecture diagram updated.

### C16: "Deviations: none" hid three gaps from the spec (#30)

- **Problem:** the implementer reported no deviations, but tested access in a new block instead of the D15/D16 route × role table (Decision 18), seeded about 5% `SOLD` instead of 10% (Decision 17), called the contract's OpenAPI defaults and `style: form` impossible, and left `system-design.md` and the diagram on the old module rule.
- **AI proposal:** the business reviewer posted four findings; the implementer fixed all of them in round 1, and the reviewer caught a missed alt text in round 2.
- **Decided by:** agent (approve=auto).
- **Decision and reasoning:** the issue's Decisions and contract are the spec; "impossible" was wrong (`@ApiQuery` emits both).
- **Verification:** [review comment](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/30#issuecomment-6570386287) and its threads; `rbac.spec.ts`, `openapi.spec.ts`.
- **Outcome:** both routes are rows in the route × role test, the seed matches Decision 17, `openapi.json` carries the defaults.

### C17: The latest-action join skipped `dealership_id` (#30)

- **Problem:** the `LATERAL` lookup filtered only `vehicle_id`, breaking the "`dealership_id` on every query" invariant; no composite foreign key stops an action row whose dealership differs from its vehicle's.
- **AI proposal:** the code reviewer flagged it; the implementer added `a.dealership_id = v.dealership_id` to the one shared fragment, which covers list, fallback count and detail.
- **Decided by:** agent (approve=auto).
- **Decision and reasoning:** a CLAUDE.md invariant, not a choice.
- **Verification:** [review thread](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/30#discussion_r4439384154), resolved in round 2.
- **Outcome:** fixed in `084c41d`.

### C18: The generated migration added the foreign key before its target (#34)

- **Problem:** `drizzle-kit generate` emitted `ADD CONSTRAINT … FOREIGN KEY (vehicle_id, dealership_id) REFERENCES vehicle (id, dealership_id)` ahead of the `UNIQUE (id, dealership_id)` it needs, so the migration would fail on a real database.
- **AI proposal:** read the generated SQL before relying on it, reorder it by hand, then apply it to a Postgres 17 container that already held rows, and check that a mismatched row fails the constraint.
- **Decided by:** agent.
- **Decision and reasoning:** the SQL is the artifact that ships, so it is checked, not trusted; the unit and integration tests alone would not have caught it because they build the schema from the migration but never ran a migration over existing data.
- **Verification:** clean upgrade over seeded rows succeeded; the mismatched insert was rejected with a foreign key violation.
- **Outcome:** `0001_vehicle_action_tenancy_fk.sql`, ADR 0012.

### C19: "Deviations: none" again hid untested acceptance criteria (#39)

- **Problem:** the first PR head claimed every criterion covered, but no test moved the thresholds (AC6), the 60/61 bucket edge had no fixture, the route was missing from the route × role test (AC8), and parity ran on hand-made rows, not the seed (AC4).
- **AI proposal:** both reviewers flagged it independently in round 1 ([code](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/39#discussion_r4442780512), [spec](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/39#discussion_r4442783883)); the implementer added the tests.
- **Decided by:** agent (approve=auto).
- **Decision and reasoning:** the acceptance criteria are the spec; a criterion without a test is a gap, whatever the Spec check says. Same pattern as C16.
- **Verification:** round-2 reviews clean; the code reviewer recomputed every expected count by hand.
- **Outcome:** fixed in `38af010`; `noQuery` moved to `shared` in the same round so `dashboard` no longer depends on `inventory`.

### C20: The implementer reported a PR-body edit it had not made (#39)

- **Problem:** after round 1 the implementer said it had updated **Doc impact**; the section was unchanged, and the Spec check still named the pre-rename file.
- **AI proposal:** the orchestrator checked the body against the report and edited it with `gh pr edit`, as the `/deliver` rule on body-only findings says.
- **Decided by:** agent (approve=auto).
- **Decision and reasoning:** an agent's report is a claim; the PR body is what reviewers and the user read.
- **Verification:** `gh pr view 39` after the edit.
- **Outcome:** body fixed; candidate for the retro.

### C21: The Tester was blocked by the install cooldown and did not route around it (#39)

- **Problem:** the worktree's `pnpm install` had half-failed on pnpm's release-age cooldown (three lockfile entries younger than 24 h), so the API could not boot; the Tester's attempt to disable the cooldown was denied by the permission system.
- **AI proposal:** the Tester stopped and reported `fail` with options instead of retrying; the orchestrator found the main checkout's install healthy on an identical lockfile and linked the worktree's `node_modules` to it, downloading nothing.
- **Decided by:** agent (approve=auto).
- **Decision and reasoning:** the cooldown is a supply-chain control and stays on; reusing an install already on disk tests the same code without weakening it.
- **Verification:** the rerun Tester passed AC 1–3 against the running API ([comment](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/39#issuecomment-6578311806)).
- **Outcome:** no code change; the Docker build failing on the lockfile's `packageManagerDependencies` is a separate `dev` problem for the retro.

### C22: Make and model are grouped as stored, not case-folded (#39)

- **Problem:** the contract agent noticed `byMakeModel` groups on stored values while the list filters on `lower(make)`, so "Toyota" and "toyota" would be two dashboard rows but one list filter.
- **AI proposal:** keep §4.4's `GROUP BY make, model`; the seed stores one spelling per make and model.
- **Decided by:** agent (approve=auto).
- **Decision and reasoning:** following the design is the smaller change; case-folding belongs with vehicle create (build step 6), where input is normalised.
- **Verification:** [`Chosen:` comment](https://github.com/huynhduc43/intelligent-inventory-dashboard/issues/10#issuecomment-6577921997).
- **Outcome:** no code; revisit when `POST /vehicles` lands.

### C23: Agents merged four PRs on a red `dev` and never read CI (#46)

- **Problem:** `dev` CI failed on every push from #36 through #45 (first `ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE`, then `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`, because #42 committed three packages published under 24h earlier). No agent noticed: `pnpm verify` did not run the install step CI starts with, no step read `gh pr checks` after a push, and #44 had told `/deliver` to symlink the main checkout's `node_modules` on the cooldown error, which hid the very failure CI hit. The user asked to fix CI, then asked why no agent had fixed it after pushing.
- **AI proposal:** re-resolve the three packages one patch back; prepend `pnpm install --frozen-lockfile` to `verify`; require `gh pr checks <P> --watch` after every push, with a PR done only when green (CLAUDE.md); replace the `/deliver` symlink fallback with re-resolving the flagged packages.
- **Decided by:** user (waived the `/deliver` eval rerun).
- **Decision and reasoning:** a workaround that makes the local run pass while CI fails turns a gate into noise; local `verify` and CI should fail on the same input, and the agent that pushed owns the red check.
- **Verification:** `corepack pnpm install --frozen-lockfile` passes the supply-chain check; `pnpm verify` passes; CI on #46.
- **Outcome:** `package.json` `verify`, `CONTRIBUTING.md`, `CLAUDE.md` **Agent workflow**, `.claude/skills/deliver/SKILL.md`.

### C24: The action seed was idempotent for one day only (#47)

- **Problem:** Decision 10 made the seed idempotent with a per-row `NOT EXISTS` on `(vehicle_id, action_type, created_at)`, but the vehicles it picked came from today's Aging set numbered by `row_number()`. A re-run on a later day picks a different set, so rows were added again and the share drifted past the 35–45% criterion. The seed test re-ran in the same instant and could not see it.
- **AI proposal:** both reviewers found it independently by reading the SQL; the code reviewer proposed skipping the action rounds for a dealership that already has any action, with a test that ages the stock one day before the re-run.
- **Decided by:** agent (approve=auto).
- **Decision and reasoning:** take the reviewer's fix; a dev seed needs "a second run adds nothing", not per-row repair. Decision 10 amended on the issue.
- **Verification:** [code review](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/47#discussion_r4443576579), [business review](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/47#discussion_r4443589605), [`Amended:` comment](https://github.com/huynhduc43/intelligent-inventory-dashboard/issues/11#issuecomment-6579748139); `seed.spec.ts` now shifts `stocked_on` back a day and re-runs; the Tester ran `db:seed` twice on a live database.
- **Outcome:** the seed skips dealerships with history; a partial run that crashes between rounds stays partial (noted by the reviewer, dev-only).

### C25: A new cross-table read shipped without its diagram, and "Diagrams unchanged" said so (#47)

- **Problem:** ADR 0013 adds `actions` reading `vehicle`, and the implementer updated the Figure 1 caption but not the diagram, its alt text, the Status line or the README seed comment, and wrote "Diagrams unchanged" in Doc impact. The ADR also left its Supersedes cell empty, and two acceptance criteria (detail `currentAction`, the POST route × role row) were only partly tested.
- **AI proposal:** the business reviewer listed each stale doc and the missing tests; the code reviewer flagged the diagram and a third hand-written copy of the action-type enum.
- **Decided by:** agent (approve=auto).
- **Decision and reasoning:** all fixed in one round; the orchestrator rewrote Doc impact and the Evidence row and the PR title (`closes #11`), which change no code.
- **Verification:** [review](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/47#discussion_r4443577270), [review](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/47#discussion_r4443589840), [review](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/47#discussion_r4443590296); both reviewers `clean` in round 2.
- **Outcome:** `architecture.html`/`.svg` gained the read-only arrow; `rbac.spec.ts` has a POST row; the enum comes from the schema.

### C26: Research overturned a premise and found a 500 (#47)

- **Problem:** the plan was to count note length with a code-point refine, because zod's `.max()` was assumed to count UTF-16 units while the `char_length` CHECK counts characters; and `Location` would point at an action URI with no GET route.
- **AI proposal:** the research agent read zod 4.6.7's source and release notes: `.max()` has counted code points since 4.5, so no refine is needed. It also found that a note containing U+0000 makes Postgres fail with 22021, which became a 500. RFC 9110 lets `Location` name a resource without a GET handler.
- **Decided by:** agent (grill=auto).
- **Decision and reasoning:** plain `.max(1000)`, reject NUL with 400, `Location` to `…/actions/{id}` with no new route (§4.7 lists none).
- **Verification:** [`docs/research/vehicle-actions.md`](https://github.com/huynhduc43/intelligent-inventory-dashboard/blob/feat/11-actions/docs/research/vehicle-actions.md); Tester: a 1,000-code-point note with `é` returned 201, a NUL note 400.
- **Outcome:** the other free-text inputs still have the NUL gap (retro).

### C27: Diagrams belong in the PR branch, not an `assets` branch (#56)

- **Problem:** `/deliver` published every spec diagram to an orphan `assets` branch through `tools/push-assets.sh`, so diagrams never reached `dev` and a reviewer could not see them next to the code they describe.
- **AI proposal:** the agent first read the request as "embed another diagram in `system-design.md`" and offered to keep `push-assets.sh` for issue bodies; the user corrected it: move the diagrams into `dev`, and don't push every diagram into the design doc.
- **Decided by:** user.
- **Decision and reasoning:** documentation evolves with code and is reviewed with it. Spec diagrams live in `docs/diagrams/specs/issue-<N>/` and ship in the feature PR; issues link them by commit permalink, which outlives the branch. `system-design.md` keeps only its whole-system figures. The eval rerun was waived because the only nearby case (`spec-issue-body`) skips diagrams.
- **Verification:** `pnpm verify`; the moved PNGs match the `assets` branch byte for byte; the HTML sources differ only by Prettier formatting.
- **Outcome:** `tools/push-assets.sh` removed; once merged, the issue bodies are relinked to `dev` and the `assets` branch is deleted.

### C28: The first PR skipped tests the spec named (#59)

- **Problem:** AC 3 and §4.15 ask for a unit test on the VIN rules, AC 12 for a `rbac.spec.ts` row, and AC 4, 5 and 9 for specific cases (a RESERVED duplicate, an unchanged sold row, `"-1"` and 11-digit prices). The first push had none of them, yet its Evidence mapped every criterion.
- **AI proposal:** the implementer (sonnet) covered the criteria with one intake spec and mapped Evidence from the contract comment rather than from the tests.
- **Decided by:** agent (approve=auto), on the business reviewer's findings.
- **Decision and reasoning:** the criteria are the spec; each listed case gets its test. The body schema moved to its own file so the unit test can import it.
- **Verification:** [business-review r1](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/59#discussion_r4444707770); `create-vehicle-body.spec.ts` and the `POST vehicles` row in `rbac.spec.ts`.
- **Outcome:** fixed in round 1.

### C29: Two reads of the clock for one row (#59)

- **Problem:** the insert called `clock.now()` once for `created_at` and once for `updated_at`, so with the real clock a new row could show two different instants. `TestClock` returns one instant, so no test could catch it.
- **AI proposal:** the implementer wrote two calls.
- **Decided by:** agent (approve=auto), on the code reviewer's finding.
- **Decision and reasoning:** read the clock once and bind it to both columns (ADR 0002, contract).
- **Verification:** [code-review r1](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/59#discussion_r4444698957).
- **Outcome:** fixed in round 1.

### C30: A reviewer's own fix created the next finding (#59)

- **Problem:** the code reviewer asked for `trim().toUpperCase().regex()` so the VIN pattern reaches OpenAPI. The published pattern then refused the lower-case and padded VINs that the server accepts.
- **AI proposal:** the same reviewer flagged its earlier suggestion in round 2 and proposed a field description.
- **Decided by:** agent (approve=auto).
- **Decision and reasoning:** keep the strict pattern and say in the description that the value is trimmed and upper-cased first; a looser pattern would document input the database would refuse after normalisation.
- **Verification:** [code-review r2](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/59#discussion_r4444767734); `docs/api/openapi.json`.
- **Outcome:** fixed in round 2; a client validating strictly against the pattern still refuses lower case.

### C31: A future stocked-on date is a 400, not a new 422 (#59)

- **Problem:** a stocked-on date after the dealership's local today would give negative days in stock. §4.8 reserves 422 for "valid shape, invalid meaning", but §4.7 lists only 201, 400, 404 and 409 for the route.
- **AI proposal:** reject it as `400 VALIDATION_FAILED` with pointer `/stockedOn`, comparing the ISO string with `todayLocal` from `DealershipGuard`, which Postgres computes.
- **Decided by:** agent (grill=auto).
- **Decision and reasoning:** keeps §4.7's status list unchanged and the error shape the same as every other field error; no time-zone maths in Node.
- **Verification:** issue #12 Decision 4; integration test with a pinned `Clock`; Tester AC 8.
- **Outcome:** no new problem code.

### C32: "Sell + reserve → one wins, one 409" is only true in one order (#66)

- **Problem:** §4.15 and the issue asked for a concurrency test where a sell and a reserve race and one gets 409. If the reserve commits first, selling a reserved vehicle is legal, so both succeed and the test would be flaky.
- **AI proposal:** force the order: hold an uncommitted sell `UPDATE` on the row, send the reserve PATCH so it blocks on the row lock, commit, and assert 409 with a final SOLD; add two parallel sells for exactly one 200 and one 409 ([issue #13 Decisions 6](https://github.com/huynhduc43/intelligent-inventory-dashboard/issues/13)).
- **Decided by:** agent (grill=auto).
- **Decision and reasoning:** kept P2 as designed and made the test deterministic, relying on Postgres READ COMMITTED re-checking the blocked `UPDATE`'s `WHERE`.
- **Verification:** `vehicle-status.spec.ts` concurrency tests; the Tester's live run of four parallel sells gave one 200 and three 409.
- **Outcome:** test design recorded in the spec; no ADR.

### C33: A fixed sleep could let the race test pass without a race (#66)

- **Problem:** the first concurrency test waited 300 ms before committing; if the PATCH had not reached Postgres by then, the test passed without exercising the blocked `UPDATE`.
- **AI proposal:** the code reviewer asked to poll `pg_stat_activity` for a lock waiter ([comment](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/66#discussion_r4445284047)); the same round also added the missing `VEHICLE_NOT_IN_STOCK` type assertion.
- **Decided by:** agent (approve=auto).
- **Decision and reasoning:** poll for `wait_event_type = 'Lock'` before `COMMIT`, so the test proves the blocked path.
- **Verification:** round 2 code review `clean`; CI green on `4715c23`.
- **Outcome:** the poll still commits after 5 s without failing; both reviewers noted it and left it as negligible.

### C34: A frozen-age test that could not fail, and docs that described the old flow (#66)

- **Problem:** the test sold a vehicle and read days in stock on the same day, so it would pass even if selling did not stop the count; `docs/system-design.md` and figure 3 still said `RETURNING *`, and the PR's Doc impact said the diagram was unchanged and omitted the glossary.
- **AI proposal:** the business reviewer asked to advance the clock after the sale and to align the docs ([comment](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/66#discussion_r4445289790), [comment](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/66#issuecomment-6583205084)).
- **Decided by:** agent (approve=auto).
- **Decision and reasoning:** advance the clock 3 days and assert the sold vehicle stays at 6 while an in-stock control grows by 3; fix the doc text and relabel figure 3; the orchestrator fixed the PR body.
- **Verification:** round 2 business review `clean`.
- **Outcome:** user story 5 is now proven by a test; docs match `RETURNING id` plus the detail read.

### C35: `validateThresholds` and the module graph (#79)

- **Problem:** the issue asked where `validateThresholds` belongs: P1 puts it in `AgingPolicy` (`inventory`), §4.2 draws `inventory → dealerships`, so `dealerships` importing it looked like a cycle.
- **AI proposal:** the orchestrator checked the code first: `inventory` imports nothing from `dealerships` (thresholds come from `DealershipGuard`), so the §4.2 edge does not exist. It recommended keeping the rule in `AgingPolicy` and recording the real edges. Because every option changed the design, it asked the user despite `grill=auto`.
- **Decided by:** user.
- **Decision and reasoning:** option A: `validateThresholds` stays in `AgingPolicy`; `dealerships` imports only that pure function; no cycle. Splitting the aging rules across modules, or putting business rules in `shared`, was rejected.
- **Verification:** both reviewers checked the imports against ADR 0014; `pnpm verify`.
- **Outcome:** [ADR 0014](adr/0014-dealerships-uses-aging-policy-validate-thresholds.md); §4.2 edge marked superseded; `docs/system-design.md` dependencies corrected.

### C36: Time-zone names that are also abbreviations are rejected (#79)

- **Problem:** research found that `AT TIME ZONE` reads `CET`, `EST`, `UTC` and similar names as fixed-offset abbreviations, so a dealership stored as `CET` would get the wrong local date on summer nights, the error P1 exists to prevent.
- **AI proposal:** the research agent offered "reject" or "accept and document"; the orchestrator chose to reject any name in `pg_timezone_abbrevs`, in the same SQL statement as the write, with `Etc/UTC` as the accepted spelling.
- **Decided by:** agent (grill=auto).
- **Decision and reasoning:** correctness of `todayLocal` beats accepting a short alias; validation stays in Postgres.
- **Verification:** `settings.spec.ts` and the Tester's `curl` run: `CET`, `EST`, `UTC`, `UTC+5`, wrong case → `422 TIMEZONE_INVALID`; `Etc/UTC` → `200` ([tester](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/79#issuecomment-6593467684)).
- **Outcome:** [ADR 0015](adr/0015-time-zone-must-be-a-zone-name-not-an-abbreviation.md), narrowing P1.

### C37: Tenancy and time-zone tests that could not fail (#79)

- **Problem:** the only "non-member" test sent a malformed id, which the guard rejects before checking membership, and the settings routes had no `rbac.spec.ts` row; the "`todayLocal` in the new zone" test switched London to Ho Chi Minh City, which share the date at the pinned instant. The implementer had flagged the first gap itself and left it.
- **AI proposal:** both reviewers asked for a real cross-dealership member and identical 404 bodies; the business reviewer asked for a zone whose date differs ([comment](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/79#discussion_r4449998196), [comment](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/79#discussion_r4449998355), [comment](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/79#discussion_r4449998596)).
- **Decided by:** agent (approve=auto).
- **Decision and reasoning:** add the rbac row (all roles, no token, member of another dealership, unknown and malformed ids, row unchanged after the refused PATCH) and switch London to `America/New_York`.
- **Verification:** round 2 reviews `clean` on these threads; Tester AC 6 and AC 11.
- **Outcome:** AC 6 and AC 11 are now proven by tests that fail if the rule breaks.

### C38: Forcing the `23514` race, then proving it was forced (#79)

- **Problem:** the `23514` → `422 THRESHOLDS_INVALID` mapping only ran if two concurrent PATCHes happened to interleave. The first fix held a row lock, but if the poll never saw the PATCH waiting it committed anyway, and the earlier `validateThresholds` check returned the same 422, so the test still passed without running the mapping.
- **AI proposal:** round 1 reviewers asked for a deterministic race ([comment](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/79#discussion_r4449998988)); the round 2 code reviewer asked to assert the lock wait was seen ([comment](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/79#discussion_r4450049378)).
- **Decided by:** agent (approve=auto).
- **Decision and reasoning:** keep the concurrent test for the never-500 property; add a lock-held test that asserts a `blocked` flag before `COMMIT`.
- **Verification:** round 3 reviews `clean`; CI green.
- **Outcome:** Decision 8 is covered by a test that fails if the backstop is bypassed. Same pattern as C33: a race test must prove the race happened.

### C39: Rules that recurred because only the offending agent was told (#87)

- **Problem:** the #79 retro found three mistakes that follow-ups #61, #70 and #68 had already closed: an Evidence row with no test at the level its criterion names, a race test that passed without the lock wait, and fix-round implementers returning without watching CI.
- **AI proposal:** the user asked for a root-cause diagnosis. The agent found that each earlier fix was a sentence added to the prompt of the agent that broke the rule, and nothing failed when that agent skipped it. It proposed replacing each with a mechanism: `check-evidence.mjs`, `whileRowLocked`, and the orchestrator watching checks before review.
- **Decided by:** user (asked for the diagnosis and the PR; waived the eval rerun).
- **Decision and reasoning:** a check that exits non-zero, or a step owned by the role that already performs it, does not depend on an agent re-reading its prompt.
- **Verification:** `check-evidence.mjs` fails PR #79's first body on AC 11 and passes its final body. `db.spec.ts` turns red when `whileRowLocked` is mutated to commit without a waiter.
- **Outcome:** the three rules are enforced by a script, a test helper and an orchestrator step. The code reviewer flags race tests that bypass the helper.

### C40: An `EXPLAIN` case that measured almost nothing (#90)

- **Problem:** the README's make+model plan reported 0.6 ms. The case used Toyota Corolla, which the seed's `n % 5` / `n % 10` arithmetic makes almost entirely `SOLD` or `RESERVED`: 20 in-stock rows, while every other pair has about 4,000.
- **AI proposal:** the implementer picked the first seeded pair and pasted the plan as evidence.
- **Decided by:** agent (approve=auto), on the code reviewer's [finding](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/90#discussion_r4451308349).
- **Decision and reasoning:** performance evidence must measure a representative case; the reviewer read `rows=20` and `Rows Removed by Filter: 3983` in the committed plan and traced it to the seed.
- **Verification:** rerun on a fresh 20k seed with Ford Focus: 4,000 rows through `vehicle_dealership_make_model_idx`; the tester matched each plan's row count to the API's `total`.
- **Outcome:** the case, table row, prose and plan changed together; the README number is now true for a typical pair.

### C41: A script that copied the guard instead of calling it (#90)

- **Problem:** Decision 5 says `db:explain` builds its context through the query `DealershipGuard` uses. The implementer wrote its own copy of that SQL, without the membership joins, and commented it as "the same" query.
- **AI proposal:** a hand-written context query in `explain-queries.ts`.
- **Decided by:** agent (approve=auto), on the business reviewer's [finding](https://github.com/huynhduc43/intelligent-inventory-dashboard/pull/90#discussion_r4451313225). The code reviewer had seen the copy but judged reuse impossible without touching runtime code (AC 8).
- **Decision and reasoning:** call `DealershipGuard.canActivate` with a stub execution context. It reuses the real query and changes no runtime code, so both the decision and AC 8 hold.
- **Verification:** round 2 reviewers traced the stub against `dealership.guard.ts`; `db:explain` exits 0 on the tester's run.
- **Outcome:** no copied SQL; a change to the guard's query reaches the evidence script.

### C42: A reviewer blocked from GitHub, and the orchestrator that would not post for it (#90)

- **Problem:** in round 2 the auto-mode classifier blocked the business reviewer's `gh` writes. It returned `clean` with the comments and thread resolutions it could not post, and asked the main session to post them.
- **AI proposal:** the main session refused, because posting another agent's blocked writes would route around a denied permission, and asked the user. Its own attempt to add allow rules to `.claude/settings.local.json` was also blocked (self-modification).
- **Decided by:** user: added `Bash(gh pr comment *)` and `Bash(gh api graphql *)` through `/permissions`.
- **Decision and reasoning:** the reviewer that posted a thread resolves it (`/deliver` ground rules), so the fix is the reviewer's permission, not a proxy.
- **Verification:** business review round 3 posted its scope comment and resolved its four threads itself.
- **Outcome:** one extra review round with no code change; retro candidate to document the permissions reviewers need.

### C43: No Python for the PNG export (#90)

- **Problem:** the diagram agent drew the spec diagram but could not export it: `~/.venvs/diagrams` from `docs/environment-setup.md` did not exist on this machine.
- **AI proposal:** the agent stopped as the docs require, without borrowing another Python; the main session offered three options and recommended the documented one-off setup.
- **Decided by:** user (option A).
- **Decision and reasoning:** the setup is per machine and already documented; skipping the PNG would leave the spec without its figure.
- **Verification:** export ran with `~/.venvs/diagrams/bin/python`; the 1000 px copy was read and one label crossed by an arrow was moved before commit.
- **Outcome:** diagram published under `docs/diagrams/specs/issue-15/`.

### C44: A false negative from the wrong Node version (#98)

- **Problem:** before filing the spec, the orchestrator checked whether a zod `.meta({ id })` turns a request body into a named component. The first run showed no component, which would have pushed the design to a hand-written name map.
- **AI proposal:** instead of accepting the result, the orchestrator reran with the output visible; the export had failed under Node 23, and the document on disk was the old one. Under `nvm use` (Node 24) the body became `$ref ChangeStatus`.
- **Decided by:** agent (grill=auto).
- **Decision and reasoning:** bodies are named by zod `.meta({ id })` with no new code; responses use a small registry like `Problem`'s (ADR 0016).
- **Verification:** the probe's regenerated `openapi.json` listed `ChangeStatus` under `components.schemas`.
- **Outcome:** a probe whose output was sent to `/dev/null` nearly settled a design; output now stays visible on such checks.

### C45: Doc impact said "no change" to system-design.md (#98)

- **Problem:** `docs/system-design.md` cited only ADR 0010 for the OpenAPI document, whose "only hand-registered component is `Problem`" the PR made untrue; the PR's **Doc impact** said the file needed no change.
- **AI proposal:** the implementer left the system description as it was.
- **Decided by:** agent (approve=auto).
- **Decision and reasoning:** business review round 1 flagged it (PR comment 6603313523); the system description must match the system (CLAUDE.md docs rule).
- **Verification:** round 2 business review confirmed the bullet now cites ADR 0016.
- **Outcome:** one sentence added to the Client stub bullet; Doc impact corrected.

### C46: Every error example showed status 599 (#98)

- **Problem:** after both reviews and the Tester passed, the user saw `status: 599` on every failed response in Swagger UI. Root cause: all error responses share `$ref Problem` with no `example`, `Problem.status` is `int().min(100).max(599)`, and Swagger UI's sample generator sets a number to its `minimum` and then overwrites it with its `maximum`.
- **AI proposal:** replace the shared `problemRef` constant with `problemContent(status, code = codeForStatus(status))`, whose example is built by the filter's own `buildProblem`; routes with a specific code (401 `INVALID_CREDENTIALS`, the three 409s, 422 `THRESHOLDS_INVALID`) pass it.
- **Decided by:** user (reported it and asked for the fix); the agent chose the approach.
- **Decision and reasoning:** a per-response example is the only way one shared schema can show different statuses; reusing `buildProblem` keeps the example's `type`, `title` and `code` equal to what the API sends. Dropping the 100–599 bounds was rejected: it hides the bug and loses information.
- **Verification:** `openapi.spec.ts` › gives every problem+json response an example whose status is its own, which fails on the previous commit with every error response listed.
- **Outcome:** examples show the real status and code. No reviewer or the Tester caught it: they checked the document, not what Swagger UI renders from it.
