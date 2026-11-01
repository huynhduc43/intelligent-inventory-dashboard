---
tags: [skill-creator, deliver]
max_turns: 80
timeout_seconds: 2400
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Act as the /deliver Implementer (role 4) for the issue in the input file `issue-90.md`, with `bug=no`, working in the sandbox repo as the worktree. Follow the implementer agent file of the skill under test. Do steps 1-4 of its Build section, with these dry-run limits: commit on the sandbox branch but do not push or open a PR; instead of `pnpm verify` (which needs Docker for integration tests) run `pnpm lint`, `pnpm typecheck` and `pnpm --filter @inventory/api exec vitest run --project unit --coverage`. Save to the outputs folder: `pr-body.md` (the PR body you would open), `commands.md` (each check command you ran, in order, with the tail of its output), and `changes.diff` (`git -C <sandbox> diff origin/dev...HEAD`).

Dry run: this is an evaluation. Work only inside the sandbox repo you are given. Never run a `gh` or `git` command that writes to GitHub or a remote (issue/PR create, edit or comment, review, label, push), and never commit outside the sandbox. Write anything you would have posted to GitHub as a file in the outputs folder instead, named as the prompt says.

Input files: issue-90.md
