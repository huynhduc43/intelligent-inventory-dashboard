# Findings, code review round 1 (dry run)

> Saved by the orchestrator from the subagent's hand-back: a harness hook blocked subagents from writing .md report files. Condensed to header, sites and the first sentence of Failure/Why/Fix.

## Comment 1
```
[code-review r1] blocker
Sites: actions.service.ts:21, :45
Failure: Member of A gets B's action history (cross-tenant leak).
Why: list() filters vehicle_action only by vehicle_id; the daysInStock read at :45 also lacks the filter.
Fix: Add eq(vehicleAction.dealershipId, ctx.dealershipId); delete or scope the :45 read.
```

## Comment 2
```
[code-review r1] blocker
Sites: actions.service.ts:3, :4, :46, :47, package.json:21
Failure: (a) date-fns is imported but not in package.json, so typecheck/boot fail. (b) daysInStock from Node ICU tzdata can be a day off from GET /vehicles.
Why: Time-zone maths in Node against decision 2, D2/P1 and the invariant.
Fix: Remove both imports and the date-fns-tz dependency (package.json:21); compute in SQL from today_local.
```

## Comment 3
```
[code-review r1] major
Sites: actions.service.ts:26, :35, :42
Failure: Concurrent POSTs on SOLD vehicles exhaust the pool -> 500 instead of 409.
Why: The re-read inside db.transaction uses this.db instead of tx; the transaction is not needed.
Fix: Delete the transaction and run one CTE statement.
```

## Comment 4
```
[code-review r1] major
Sites: actions.service.ts:32
Failure: POST returns snake_case keys and a string id; GET returns camelCase.
Why: Raw RETURNING * skips Drizzle mapping.
Fix: Map to the camelCase action shape.
```

## Comment 5
```
[code-review r1] major
Sites: actions.service.ts:17
Failure: Unknown vehicle -> 200 [] instead of 404; bare array instead of {items}.
Why: list() never checks the vehicle exists.
Fix: 404 when missing; return { items }.
```

## Comment 6
```
[code-review r1] major
Sites: test/integration/actions.spec.ts:44
Failure: 'rejects a sold vehicle' passes on any 4xx/5xx.
Why: The PR replaced the 409, problem+json and code assertions with toBeGreaterThanOrEqual(400).
Fix: Restore the three assertions; add RESERVED/404/daysInStock/cross-tenant tests.
```

## Comment 7
```
[code-review r1] minor
Sites: actions.service.ts:8, :25
Failure: unconfirmed — no controller/module/validation in the diff.
Why: The service accepts an unvalidated string.
Fix: Add controller, module, permissions and zod validation.
```

