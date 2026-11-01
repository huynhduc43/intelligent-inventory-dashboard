---
type: llm
focus: trace
weight: 1
---

changes.diff adds an exported `validateThresholds` in src/modules/inventory/domain/aging-policy.ts that returns `{ ok: true }` or `{ ok: false, code: 'INVALID_THRESHOLDS', reason }` and does no I/O.
