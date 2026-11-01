---
tags: [skill-creator, deliver]
max_turns: 60
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Run only role 2 step 3 (Spec) of /deliver for this requirement, using the decisions in the input file `decisions.md` as the settled grill output. Skip the diagram and publishing parts (no diagrams exist yet; keep the `## Diagrams` placeholder).

Requirement: "Managers sometimes log an action with a typo in its note. Let the manager who logged an action fix its note within 15 minutes of logging it."

Write the issue title to `title.txt`, the issue body exactly as you would post it to `spec.md`, and the labels you would apply (one per line) to `labels.txt`, all in the outputs folder.

Dry run: this is an evaluation. Work only inside the sandbox repo you are given. Never run a `gh` or `git` command that writes to GitHub or a remote (issue/PR create, edit or comment, review, label, push), and never commit outside the sandbox. Write anything you would have posted to GitHub as a file in the outputs folder instead, named as the prompt says.

Input files: decisions.md
