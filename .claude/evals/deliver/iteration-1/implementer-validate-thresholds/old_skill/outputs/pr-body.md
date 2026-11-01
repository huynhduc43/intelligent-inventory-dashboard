<!-- Title: feat: add validateThresholds to AgingPolicy (closes #90) -->

Closes #90

## Summary

Adds the pure rule `validateThresholds` to `AgingPolicy`, mirroring `dealership_thresholds_chk` (D3, §4.4). No endpoint yet; the dealerships module wires it in build step 6 (Decision 3).

```diff
 // apps/api/src/modules/inventory/domain/aging-policy.ts
 tierOf(days, t)
 bucketOf(days)
+validateThresholds({ watch, aging }) -> { ok: true }
+                                      | { ok: false, code: 'INVALID_THRESHOLDS', reason }
```

```text
validateThresholds({ watch, aging })
  not both integers  -> 'watch and aging must be integers'
  watch < 1          -> 'watch must be at least 1'
  watch >= aging     -> 'watch must be less than aging'
  aging > 3650       -> 'aging must be at most 3650'
  otherwise          -> ok
```

Checks run in that order, so a request that breaks several rules gets the first reason.

## Evidence

| Acceptance criterion | Test (`apps/api/test/unit/inventory/aging-policy.spec.ts`) |
| --- | --- |
| Valid pairs (1, 2), (60, 90), (3649, 3650) return `{ ok: true }` | `validateThresholds > accepts watch %i, aging %i` (3 rows) |
| watch < 1 is rejected with a reason | `rejects watch 0, aging 90: watch must be at least 1` |
| watch >= aging is rejected | `rejects watch 90, aging 90: …` and `rejects watch 91, aging 90: watch must be less than aging` |
| aging > 3650 is rejected | `rejects watch 60, aging 3651: aging must be at most 3650` |
| Non-integer values are rejected | `rejects watch 60.5, aging 90: …` and `rejects watch 60, aging 90.5: watch and aging must be integers` |
| 100% coverage on `src/modules/inventory/domain/**` | unit coverage run: no domain-threshold error; domain-only summary below |

- **Before:** with `validateThresholds` stubbed to `{ ok: true }`, the six rejection rows fail (`Tests 6 failed | 15 passed (21)`).
  **After:** `Tests 21 passed (21)` in `aging-policy.spec.ts`; full unit project `Tests 36 passed (36)`.

<details><summary>Domain coverage (vitest --project unit --coverage, include src/modules/*/domain/**)</summary>

```text
Statements   : 100% ( 8/8 )
Branches     : 100% ( 20/20 )
Functions    : 100% ( 4/4 )
Lines        : 100% ( 7/7 )
```

</details>

Checks run: `pnpm lint`, `pnpm typecheck`, `pnpm format:check` pass. `pnpm verify` (needs Docker for the integration project) was not run in this session; the unit-only coverage run misses the global 80% gate because `health` and `shared/db.ts` are covered by integration tests, and it misses it the same way on `dev` (60% lines there, 63% here).

## Deviations

None.

## Manual steps

None.

## Merge Danger

**Door:** two-way

**Blast Radius:** none. New export only; no caller yet, no schema or endpoint change.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
