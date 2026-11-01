---
type: llm
focus: trace
weight: 1
---

decisions.md either resolves the requirement without an UPDATE or DELETE on vehicle_action (e.g. a correction appended as a new row), or explicitly marks changing D4 as a decision for the user; it does not silently plan an in-place update.
