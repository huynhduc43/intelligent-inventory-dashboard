---
tags: [skill-creator, deliver]
max_turns: 60
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Run only role 2 step 1 (Grill) of /deliver, in `grill=auto`, for this requirement:

"Managers sometimes log an action with a typo in its note. Let the manager who logged an action fix its note within 15 minutes of logging it."

Read the skill and the repo docs it points to first. Answer each question yourself with your recommended answer, as `grill=auto` says. Write every question with its answer, in order, to `decisions.md` in the outputs folder. Make any repo file changes the step calls for in the sandbox (do not commit), then save `git -C <sandbox> status --short` and `git -C <sandbox> diff` (plus the content of any new file) to `repo-changes.md` in the outputs folder.

Dry run: this is an evaluation. Work only inside the sandbox repo you are given. Never run a `gh` or `git` command that writes to GitHub or a remote (issue/PR create, edit or comment, review, label, push), and never commit outside the sandbox. Write anything you would have posted to GitHub as a file in the outputs folder instead, named as the prompt says.
