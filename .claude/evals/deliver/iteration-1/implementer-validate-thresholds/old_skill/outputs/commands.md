# Check commands (in order)

Run from the sandbox repo root on branch `eval`, after the change, before the commit.

## 1. `corepack pnpm lint`

Exit code: 0

```text
   • Remote caching disabled

@inventory/api:lint: cache miss, executing a5e171ace06ee682
@inventory/api:lint: 
<sandbox>/old_skill/apps/api
@inventory/api:lint: > eslint . --max-warnings=0
@inventory/api:lint: 

 Tasks:    1 successful, 1 total
Cached:    0 cached, 1 total
  Time:    2.726s 

```

## 2. `corepack pnpm typecheck`

Exit code: 0

```text
   • Remote caching disabled

@inventory/api:typecheck: cache miss, executing f4285b62dc6cb8e2
@inventory/api:typecheck: 
<sandbox>/old_skill/apps/api
@inventory/api:typecheck: > tsc --noEmit
@inventory/api:typecheck: 

 Tasks:    1 successful, 1 total
Cached:    0 cached, 1 total
  Time:    1.554s 

```

## 3. `corepack pnpm format:check (extra: part of pnpm verify, no Docker needed)`

Exit code: 0

```text
$ prettier --check .
Checking formatting...
All matched files use Prettier code style!
```

## 4. `corepack pnpm --filter @inventory/api exec vitest run --project unit --coverage`

Exit code: 1 (all 36 unit tests pass in 3 files; only the global 80% gate fails, as on the base; no error for the 100% `src/modules/*/domain/**` gate)

```text
 Test Files  3 passed (3)
      Tests  36 passed (36)
...
Lines        : 63.15% ( 24/38 )
================================================================================
ERROR: Coverage for lines (63.15%) does not meet global threshold (80%)
ERROR: Coverage for functions (61.11%) does not meet global threshold (80%)
ERROR: Coverage for statements (62.79%) does not meet global threshold (80%)
Error: ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL

  × "pnpm recursive exec" failed in /private/tmp/claude-501/-Users-duc-
  │ personal-projects-intelligent-inventory-dashboard/a9a417b3-0a14-482f-ba8f-
<sandbox>/old_skill/apps/
  │ api

```

## 5. Baseline: same coverage command on `eval-base` (changes stashed)

Exit code: 1 (same global-threshold failure, pre-existing)

```text
      Tests  27 passed (27)
ERROR: Coverage for lines (60%) does not meet global threshold (80%)
ERROR: Coverage for functions (56.25%) does not meet global threshold (80%)
ERROR: Coverage for statements (58.97%) does not meet global threshold (80%)
```

## 6. Domain-only coverage: `corepack pnpm --filter @inventory/api exec vitest run --project unit --coverage --coverage.include='src/modules/*/domain/**' --coverage.reporter=text-summary`

Exit code: 0

```text
Statements   : 100% ( 8/8 )
Branches     : 100% ( 20/20 )
Functions    : 100% ( 4/4 )
Lines        : 100% ( 7/7 )
```
