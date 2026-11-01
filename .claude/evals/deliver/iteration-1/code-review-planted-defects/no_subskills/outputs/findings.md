# Findings, code review round 1 (dry run)

> Saved by the orchestrator from the subagent's hand-back: a harness hook blocked subagents from writing .md report files. Condensed to header, sites and the first sentence of Failure/Why/Fix.

## Comment 1
```
[code-review r1] blocker
Sites: actions.service.ts:21, :45
Failure: Manager of A lists actions of B's vehicle -> 200 (cross-tenant leak); missing vehicle -> 200 [].
Why: list filters by vehicle_id only; the stockedOn re-read also lacks dealership_id.
Fix: Add the dealership filter; 404 on missing vehicle.
```

## Comment 2
```
[code-review r1] blocker
Sites: actions.service.ts:46, :47, :3, :4, :42
Failure: A second clock.now() near midnight gives daysInStock one higher than GET /vehicles; Node vs Postgres tzdata.
Why: daysInStock computed in Node with formatInTimeZone, against CLAUDE.md, P1/D2 and decision 2.
Fix: Compute from the guard's today_local in the insert statement; delete the date-fns imports.
```

## Comment 3
```
[code-review r1] major
Sites: actions.service.ts:26, :35
Failure: N >= pool size concurrent POSTs -> 500 instead of 409.
Why: The re-read inside the transaction uses this.db, not tx; the transaction is not needed.
Fix: Remove db.transaction.
```

## Comment 4
```
[code-review r1] major
Sites: actions.service.ts:32, :48, :18
Failure: POST snake_case raw row vs GET camelCase bare array.
Why: Raw execute bypasses Drizzle mapping; list has no items envelope.
Fix: Map both through one function; return { items }.
```

## Comment 5
```
[code-review r1] major
Sites: package.json:21, actions.service.ts:3, :4
Failure: (a) date-fns-tz added without lockfile update; (b) date-fns undeclared.
Why: The new dependency isn't justified in the PR body ('Deviations: None') and exists only for the Node tz maths.
Fix: Delete the date-fns-tz line and both imports.
```

## Comment 6
```
[code-review r1] blocker
Sites: test/integration/actions.spec.ts:44
Failure: 'rejects a sold vehicle' now passes on any 4xx/5xx.
Why: Three assertions (409, problem+json, VEHICLE_NOT_IN_STOCK) replaced by toBeGreaterThanOrEqual(400).
Fix: Restore them; add RESERVED and 404 cases.
```

## Comment 7
```
[code-review r1] minor
Sites: actions.service.ts:8, :38, spec:41
Failure: unconfirmed — PR neither builds nor routes on origin/dev; unvalidated actionType/note.
Why: The diff depends on unmerged work or is missing files.
Fix: Rebase or add the missing files; validated DTO.
```

