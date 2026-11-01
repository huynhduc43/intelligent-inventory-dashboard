# Check commands (in order)

All run from the sandbox repo root. Dry-run substitutes for `pnpm verify`, as the task specified.

## 1. TDD cycle 1 red: `corepack pnpm --filter @inventory/api exec vitest run test/unit/inventory/aging-policy.spec.ts`
```text
TypeError: validateThresholds is not a function
 Test Files  1 failed (1)
      Tests  3 failed | 12 passed (15)
```
## 2. Cycle 1 green (same command, stub that returns `{ ok: true }`)
```text
      Tests  15 passed (15)
```
## 3. Cycle 2 red (same command, rejection cases added)
```text
     × rejects watch 0, aging 90: watch must be at least 1
     × ... (8 rejection cases)
      Tests  8 failed | 15 passed (23)
```
## 4. Cycle 2 green (same command, rule implemented)
```text
      Tests  23 passed (23)
```
## 5. `corepack pnpm lint` (exit 0)
```text
@inventory/api:lint: 

 Tasks:    1 successful, 1 total
Cached:    0 cached, 1 total
  Time:    2.636s 

```
## 6. `corepack pnpm typecheck` (exit 0)
```text
@inventory/api:typecheck: 

 Tasks:    1 successful, 1 total
Cached:    0 cached, 1 total
  Time:    1.533s 

```
## 7. `corepack pnpm --filter @inventory/api exec vitest run --project unit --coverage` (exit 1, global gate only)
```text
 Test Files  3 passed (3)
      Tests  38 passed (38)
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |    61.9 |    92.85 |   58.82 |   63.15 |                   
 modules/health    |       0 |        0 |       0 |       0 |                   
  ...ase.health.ts |       0 |      100 |       0 |       0 | 7-20              
  ...controller.ts |       0 |        0 |       0 |       0 | 5-22              
 shared            |      95 |      100 |    87.5 |     100 |                   
  db.ts            |      80 |      100 |      50 |     100 |                   
-------------------|---------|----------|---------|---------|-------------------

=============================== Coverage summary ===============================
Statements   : 61.9% ( 26/42 )
Branches     : 92.85% ( 26/28 )
Functions    : 58.82% ( 10/17 )
Lines        : 63.15% ( 24/38 )
================================================================================
ERROR: Coverage for lines (63.15%) does not meet global threshold (80%)
ERROR: Coverage for functions (58.82%) does not meet global threshold (80%)
ERROR: Coverage for statements (61.9%) does not meet global threshold (80%)
Error: ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL
```
## 8. Baseline: the same coverage command with the change stashed (`git stash`), showing the global-gate failure predates it
```text
      Tests  27 passed (27)
ERROR: Coverage for lines (60%) does not meet global threshold (80%)
ERROR: Coverage for functions (56.25%) does not meet global threshold (80%)
ERROR: Coverage for statements (58.97%) does not meet global threshold (80%)
```
## 9. Domain-only coverage: `corepack pnpm --filter @inventory/api exec vitest run --project unit --coverage --coverage.include='src/modules/*/domain/**' --coverage.reporter=text` (exit 0)
```text
Statements   : 100% ( 7/7 )
Branches     : 100% ( 22/22 )
Functions    : 100% ( 3/3 )
Lines        : 100% ( 7/7 )
```
## 10. `corepack pnpm format:check` (exit 0)
```text
All matched files use Prettier code style!
```
## 11. `git commit` (pre-commit lint-staged + commitlint, exit 0)
```text
✔ eslint --fix --max-warnings=0
✔ prettier --write
70fe190 feat(inventory): validate dealership thresholds (#90)
```
