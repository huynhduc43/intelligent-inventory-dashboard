---
tags: [skill-creator, deliver]
max_turns: 60
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Act as the /deliver business reviewer (role 6), round 1, with no `since`, using the business reviewer agent file of the skill under test. The PR is not on GitHub for this evaluation: its issue, with its Decisions, Contract and Chosen comments, is the input file `issue-11.md`, its body `pr-body.md` and its diff `pr.diff`; the sandbox repo is `origin/dev` before the PR, holding the architecture doc, ADRs, CLAUDE.md, CONTRIBUTING.md, docs/system-design.md and docs/environment-setup.md. Wherever the agent file says to read the issue or PR or post a comment, use these files and write instead. Write each finding you would post, in the agent's finding format and in order, to `findings.md` in the outputs folder, then the report you would return to `report.md`.

Dry run: this is an evaluation. Work only inside the sandbox repo you are given. Never run a `gh` or `git` command that writes to GitHub or a remote (issue/PR create, edit or comment, review, label, push), and never commit outside the sandbox. Write anything you would have posted to GitHub as a file in the outputs folder instead, named as the prompt says.

Input files: issue-11.md, pr-body.md, pr.diff
