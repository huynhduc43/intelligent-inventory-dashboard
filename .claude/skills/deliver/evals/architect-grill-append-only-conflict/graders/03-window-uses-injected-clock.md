---
type: llm
focus: trace
weight: 1
---

decisions.md states that the 15-minute window is measured with `now` from the injected Clock passed into SQL as a parameter (not DB now() and not Date.now() in a service).
