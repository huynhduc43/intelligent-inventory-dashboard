---
tags: [skill-creator, deliver]
max_turns: 60
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Run only the Finish section of /deliver (after the Tester passed) for PR #17 / issue #6, whose full record is the input file `pr17-record.md`. Skip Finish step 1 (Deviations are already linked). For every other Finish step, follow the skill under test as written: edit files in the sandbox repo where it says to (do not commit or push), and save everything else to the outputs folder: the final report to the user as `report.md`, any retrospective as `retro.md`, and `git -C <sandbox> diff` as `repo-changes.diff`. The user's language is Vietnamese.

Dry run: this is an evaluation. Work only inside the sandbox repo you are given. Never run a `gh` or `git` command that writes to GitHub or a remote (issue/PR create, edit or comment, review, label, push), and never commit outside the sandbox. Write anything you would have posted to GitHub as a file in the outputs folder instead, named as the prompt says.

Input files: pr17-record.md
