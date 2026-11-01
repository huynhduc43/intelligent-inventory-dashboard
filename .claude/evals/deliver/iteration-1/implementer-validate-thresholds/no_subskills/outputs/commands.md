# Check commands, in order

All commands were run from the sandbox repo root.

1. Red: `corepack pnpm --filter @inventory/api exec vitest run test/unit/inventory/aging-policy.spec.ts` (new tests, before the implementation)
   ```
    Test Files  1 failed (1)
         Tests  10 failed | 12 passed (22)
   Error: ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL
   ```
2. Green: the same command after the implementation
   ```
    Test Files  1 passed (1)
         Tests  22 passed (22)
   ```
3. `corepack pnpm typecheck`
   ```
    Tasks:    1 successful, 1 total
   ```
4. First full pass (log: `raw-checks.log`):
   - `corepack pnpm format:check` exited 1:
     ```
     [warn] apps/api/src/modules/inventory/domain/aging-policy.ts
     [warn] Code style issues found in the above file. Run Prettier with --write to fix.
     ```
     Fixed with `corepack pnpm exec prettier --write apps/api/src/modules/inventory/domain/aging-policy.ts`.
   - `corepack pnpm lint` exited 0.
   - `corepack pnpm typecheck` exited 0.
   - `corepack pnpm --filter @inventory/api exec vitest run --project unit --coverage` exited 1 (global threshold, see 7).
5. Baseline: the same coverage command on the unchanged code (`git stash`, then `git stash pop`; log: `cov-base.log`)
   ```
   All files          |   58.97 |     87.5 |   56.25 |      60 |
   ERROR: Coverage for lines (60%) does not meet global threshold (80%)
   ERROR: Coverage for functions (56.25%) does not meet global threshold (80%)
   ERROR: Coverage for statements (58.97%) does not meet global threshold (80%)
   ```
6. After the commit (`6f97ce5`):
   - `corepack pnpm format:check`
     ```
     All matched files use Prettier code style!
     exit 0
     ```
   - `corepack pnpm lint`
     ```
     @inventory/api:lint: > eslint . --max-warnings=0
      Tasks:    1 successful, 1 total
     exit 0
     ```
   - `corepack pnpm typecheck`
     ```
      Tasks:    1 successful, 1 total
     exit 0
     ```
7. `corepack pnpm --filter @inventory/api exec vitest run --project unit --coverage` (log: `cov-after.log`)
   ```
    Test Files  3 passed (3)
         Tests  37 passed (37)
   All files          |    61.9 |    92.85 |   58.82 |   63.15 |
    modules/health    |       0 |        0 |       0 |       0 |
    shared            |      95 |      100 |    87.5 |     100 |
   Statements   : 61.9% ( 26/42 )
   Branches     : 92.85% ( 26/28 )
   Functions    : 58.82% ( 10/17 )
   Lines        : 63.15% ( 24/38 )
   ERROR: Coverage for lines (63.15%) does not meet global threshold (80%)
   ERROR: Coverage for functions (58.82%) does not meet global threshold (80%)
   ERROR: Coverage for statements (61.9%) does not meet global threshold (80%)
   ```
   All tests pass. The run fails only on the global 80% threshold, which it also failed on the base code (step 5). The files below 80% (`health`, `db.ts`) are exercised by the integration project, which this run leaves out. The 100% per-glob threshold for `domain/**` raised no error.
8. Confirmation: the same coverage command with `--coverage.reporter=json-summary`
   ```
   modules/inventory/domain/aging-policy.ts {'lines': 100, 'branches': 100, 'functions': 100, 'statements': 100}
   ```
