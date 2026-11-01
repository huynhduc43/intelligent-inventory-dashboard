---
name: deliver
description: Take one requirement from research to a tested PR through seven roles — Analyst, Architect, Contract, Implementer, code review, business review, Tester.
disable-model-invocation: true
argument-hint: <requirement | #issue> [grill=auto|manual] [approve=auto|manual] [from=implement]
---

# Deliver

Carry the requirement in `$ARGUMENTS` through the roles below, in order. Each role ends on its **done** line; start the next role only when that line holds.

## Modes

Both modes default to `manual`. Say which ones are in force before the first role starts.

- `grill`: in `manual`, ask the Architect's questions one at a time and wait for each answer. In `auto`, answer each question yourself with your recommended answer.
- `approve`: in `manual`, stop at each **gate** and wait for the user. In `auto`, take the recommended choice at each gate and go on.
- `from=implement` with `#<N>`: resume at role 4 for issue `#N`, reading everything from GitHub (see **Checkpoint**).

## Ground rules

- Talk to the user in their language. Write everything on GitHub (issues, PRs, comments) in English.
- Running `/deliver` is the user's consent to the issues this workflow creates (the CLAUDE.md rule about asking first).
- Work in one worktree from the first file written: `../intelligent-inventory-dashboard-<topic>` on branch `<type>/<topic>` off `origin/dev` (CONTRIBUTING.md **Branches**). Once the issue exists, rename both to carry its number: `git branch -m <type>/<N>-<topic>`, then `git worktree move ../intelligent-inventory-dashboard-<topic> ../intelligent-inventory-dashboard-<N>-<topic>`.
- **The design is the baseline.** `docs/research/backend-architecture.md` and the invariants in CLAUDE.md bind every role. So do the ADRs in `docs/adr/`. Cite decisions by their number (D1–D19, P1–P3, §4.x, ADR-NNNN). A requirement that contradicts one is a decision for the user, and once agreed, the same PR records it as an ADR that supersedes it (CLAUDE.md **Agent workflow**, docs rule).
- **Keep the main session lean.** It holds the conversation with the user and the hand-offs between agents; GitHub holds everything else. Work that produces large output (a contract draft, a test run, an API walk-through) runs in an agent that returns only URLs and a verdict.
- **Diagrams** are drawn with `diagram-design:diagram-design` in `html+png` format, keeping its default style (this repo has no brand profile). Whoever renders a PNG reads it before publishing, through a copy scaled to 1000 px on its long side (`sips -Z 1000 <png> --out <small.png>`), and checks that it shows what it claims. **Publish** the PNG and its HTML source with `tools/push-assets.sh issue-<N> <file>...`, which prints the Markdown image lines to paste into an issue, PR or comment.
- **Evidence** is text (test names, test output, `curl` transcripts), folded into `<details>` blocks when it is long.
- Roles 4–7 run as agents in `.claude/agents/`, which fix each agent's instructions, tools, model and effort.
- An **independent role** (`deliver-code-reviewer`, `deliver-business-reviewer`, `deliver-tester`) is spawned fresh with `subagent_type` set to its name, and this one line is its whole prompt: `pr=<P> issue=<N> round=<R> worktree=<path>`. A reviewer after the PR's first review also gets ` since=<sha>`, the PR head the previous review ran on; record `git -C <worktree> rev-parse HEAD` each time you spawn the reviewers. Only the agent's verdict (`clean` / `pass`) ends its role. The reviewer that posted a comment is the one that resolves its thread, once it judges the comment resolved or accepted; the main session and the Implementer leave threads to it.
- **Send findings back** by spawning a fresh `deliver-implementer` with `round=<R> pr=<P> issue=<N> worktree=<path>`, followed by the returned comment URLs and tester failures, unedited. A fresh agent per round keeps its context small; the code, the PR and the comment threads carry everything the earlier rounds knew.
- **Decisions.** The issue's `## Decisions` section and its `Chosen:` contract comment are the spec. When an agent returns `decision-needed: …`, put the question to the user (in `approve=auto`, take its recommendation), then record the answer in the issue's `## Decisions` with `gh issue edit <N> --body-file`, and, when it changes the design, comment `Amended: <what changed and why>` on the issue. Answer the agent with `SendMessage`: `decision: <the answer> recorded: <issue URL>`.

## 1. Requirement Analyst

First read the sections of `docs/research/backend-architecture.md` the requirement touches; an unknown the doc already settles is not an unknown. Research every unknown left against primary sources (official docs, specs, the code): NestJS, Drizzle or Postgres behaviour, RFC rules, and how the existing code handles the area today. Write the findings, with sources, to a note in `docs/research/`.

**Done:** a research note in `docs/research/` answers each unknown with sources, or you have stated that the requirement raises none beyond the architecture doc.

## 2. Architect

1. **Grill with docs.** Question the requirement yourself, one question at a time, covering the requirement, the research and the architecture sections and ADRs it touches, following the `grill` mode. Probe the easy-to-get-wrong invariants in CLAUDE.md that apply: tenancy and 404-vs-403, time zones only in Postgres, race-free conditional writes, append-only actions, derived aging. Keep every question with its answer; together they are the _decisions_. Write each resolved term to `GLOSSARY.md` and each decision that earns an ADR to `docs/adr/` (and its index) in the worktree, as you go; commit them on the branch so they ship with the PR.
2. **Diagram.** Spawn a background `general-purpose` agent with the requirement, the research note's path, the decisions and the worktree. Its prompt: invoke `diagram-design:diagram-design` and draw one diagram for each distinct question a spec reader must answer, at least one, choosing the type that fits: a sequence diagram for a request flow (guards, service, SQL), a state machine for a lifecycle, a database schema or ER diagram for a schema change, an architecture or dependency graph for a module change (keep §4.2's rules: no cycles, only `dashboard` reads across tables); save each as `html+png` in the scratchpad and check each PNG as the ground rules say; return only the file paths, one line per diagram with what it shows.
3. **Spec.** Write the spec issue yourself. Put the decisions under `## Decisions`, a `## Diagrams` placeholder, the architecture sections, decision numbers and ADRs it implements under `## Design refs`, and the §4.15-style test rows it adds (rule | test | unit or integration) under a testing section. Once the issue exists, publish the diagram files to `issue-<N>` and put the image lines, each with a one-line caption, under `## Diagrams` with `gh issue edit <N> --body-file`.
4. **Slices.** When the spec holds more than one vertical slice, split it into slice issues yourself, in §4.16 build order: each slice is a sub-issue of the spec, with native blocking edges (`docs/agents/issue-tracker.md`). Each slice issue carries its own `## Decisions`. Roles 3–7 then run once per slice issue, in dependency order, one PR each.
5. **Gate.** Give the user the issue links and a three-line summary. In `manual`, wait until they approve or ask for changes.

**Done:** the spec issue (and any slice issues) exist with their diagrams, and the gate has passed.

## 3. Contract

Run this role only when the work adds or changes an HTTP endpoint, a request, response or error shape, a permission, or a table, column or index. Otherwise, say that you are skipping it and why.

1. Spawn a background `general-purpose` agent with the issue number and worktree. Its prompt: read the issue and §4.3, §4.6, §4.7 and §4.8 of `docs/research/backend-architecture.md` and the naming table in `CONTRIBUTING.md`; draft the contract as one issue comment headed `Contract`: each endpoint (method, path under `/api/v1`, `@RequirePermission`, request and response JSON with camelCase fields, every status with its problem+json `code`), and each schema change (the DDL drizzle-kit should produce, indexes with the query each one serves, how existing rows migrate). Where a real choice exists (a status code, a resource shape, an index), give the options side by side and a recommendation with its reason; do not invent choices where the doc already decides. Return only the comment URL and the recommendation.
2. **Gate.** Send the user the comment link and the recommendation. In `manual`, wait for the user's pick. Post the chosen contract on the issue as a comment: `Chosen: <option, or "as drafted">`.

**Done:** the issue carries a `Contract` comment and a `Chosen:` comment.

## Checkpoint

Everything roles 4–7 need now lives on GitHub. In `approve=manual`, tell the user to run `/clear`, then `/deliver #<N> from=implement`, and stop. In `approve=auto`, go on in this session.

On `from=implement`: find the worktree and branch carrying `<N>` with `git worktree list`. When a PR is already open from that branch, take its number and start at **Review** with the next round; otherwise start at role 4.

## 4. Implementer (agent)

Spawn `deliver-implementer` with the prompt `issue=<N> worktree=<path> branch=<branch> bug=<yes|no>`. It returns the PR number, or `decision-needed: …` (see **Decisions**).

**Done:** `gh pr view <P>` shows the PR open into `dev`, with `Closes #<N>` and an **Evidence** section in its body that maps each acceptance criterion to its test (for a bug, the regression test's failing output on `origin/dev`).

## 5–6. Review (agents)

Run the independent roles `deliver-code-reviewer` and `deliver-business-reviewer` **in parallel**, on the same head and with the same round number. When both return `clean`, review is done. Otherwise send the open comment URLs from both back to the Implementer in one round, then run both reviewers again with the next round number and `since`. The next round's reviewers decide whether each of the Implementer's replies holds. They review only the diff since `since`, post each pattern once with all its sites, and never post a finding that an earlier comment already made, so each review is smaller than the last and stops when the fixes raise nothing new.

**Done:** both reviewers return `clean` in the same round.

## 7. Tester (agent)

Run the independent role `deliver-tester`.

Send failures back to the Implementer. After the fix, run **Review** again, then role 7 again.

**Done:** the Tester returns `pass`.

## Round limit

A **round** is one pass of the Implementer over returned findings, counted per PR whichever role sent them. Number rounds 1, 2, 3 across the whole PR. After the third round, stop. Tell the user what is still open and wait; when they allow more, keep counting from 4 up to the number they allowed.

## Finish

1. Read the PR body's **Deviations** section and check that each entry links to its line in the issue's `## Decisions` or to an `Amended:` comment. Record any that does not, through **Decisions**, before you report.
2. **AI log.** Add the PR to `docs/ai-collaboration.md` in the format its **How to add an entry** gives: one row in the PR table, and one case for each moment that shows how the AI was directed or corrected (a finding that caught an agent's mistake, a `decision-needed`, an `Amended:` comment, a Tester failure). Say who decided: the user, or the agent under `approve=auto`. Commit it to the PR branch as `docs(docs): log AI collaboration (#<N>)` and push; it is narrative, so it needs no review round.
3. **Retro.** Suggest improvements to the agent's environment (instructions, checks, tooling) from this PR, most severe first: its review and tester comments, its rounds and its decisions. Apply none of its candidates without the user's go, in either `approve` mode; approved ones go in their own `chore/` PR.
4. Report to the user, in their language: the issue and PR links, how many rounds the PR took, the Tester's result, the follow-up comments the reviewers posted, the cases added to the AI log, the retro candidates, and the manual steps still to do in each environment (from `docs/environment-setup.md` and the PR's **Manual steps**).

Merging waits for the user. Once the PR is merged, follow CLAUDE.md **Agent workflow** to clean up the worktree and branch.
