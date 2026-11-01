# Findings, code review round 1 (dry run)

> Saved by the orchestrator from the subagent's hand-back: a harness hook blocked subagents from writing .md report files. Condensed to header, sites and the first sentence of Failure/Why/Fix.

## Comment 1
```
[code-review r1] blocker
Sites: actions.service.ts:21, actions.service.ts:45
Failure: Member of A lists actions of B's vehicle -> 200 with B's actions (cross-tenant read); missing vehicle -> 200 [] instead of 404.
Why: list filters only on vehicleAction.vehicleId; ctx.dealershipId never used; the daysInStock read at :45 also lacks dealership_id.
Fix: Add eq(vehicleAction.dealershipId, ctx.dealershipId); 404 when the vehicle is missing in the dealership.
```

## Comment 2
```
[code-review r1] blocker
Sites: actions.service.ts:46, :47, :3, :4, package.json:21
Failure: daysInStock uses Node ICU tzdata and a second clock.now(), so it can be a day off from GET /vehicles; date-fns is not declared and the lockfile has no date-fns entries.
Why: Time-zone maths in Node against the invariant and issue decision 2; the PR body says 'Deviations: None' and gives no reason for the new date-fns-tz dependency.
Fix: Compute today_local - stocked_on in SQL; delete the date-fns/date-fns-tz imports and the package.json line.
```

## Comment 3
```
[code-review r1] major
Sites: actions.service.ts:26, :35
Failure: 10 concurrent POSTs on SOLD vehicles exhaust the pool and return 500 instead of 409.
Why: Inside db.transaction the re-read uses this.db instead of tx; the transaction is not needed since the conditional INSERT is atomic.
Fix: Remove the transaction; run statements on this.db.
```

## Comment 4
```
[code-review r1] major
Sites: actions.service.ts:27, :32, :48
Failure: POST returns snake_case keys and a string id while GET returns camelCase.
Why: Raw tx.execute(sql`... RETURNING *`) skips Drizzle's mapping.
Fix: Use the query builder insert ... select ... returning(), keeping one conditional statement.
```

## Comment 5
```
[code-review r1] major
Sites: test/integration/actions.spec.ts:44
Failure: The test passes for any 4xx/5xx, so a 500 or non-problem+json body goes green.
Why: The PR replaced toBe(409), the problem+json content-type check and the code check with toBeGreaterThanOrEqual(400).
Fix: Restore the three assertions and fix the code, not the test.
```

## Comment 6
```
[code-review r1] minor
Sites: actions.service.ts:36, :21, :47
Failure: 404, RESERVED, tenant filter and midnight daysInStock branches are untested.
Why: The diff adds service code for four criteria and changes one assertion.
Fix: Add one integration case each.
```

## Comment 7
```
[code-review r1] minor
Sites: actions.service.ts:25, :8
Failure: unconfirmed — no controller, module, permission decorators or input validation in the diff.
Why: The diff looks incomplete.
Fix: Confirm or add them.
```

