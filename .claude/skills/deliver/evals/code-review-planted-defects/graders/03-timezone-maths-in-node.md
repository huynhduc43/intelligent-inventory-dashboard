---
type: llm
focus: trace
weight: 1
---

findings.md flags computing today/daysInStock in Node with date-fns-tz instead of in Postgres (time zones only in Postgres).
