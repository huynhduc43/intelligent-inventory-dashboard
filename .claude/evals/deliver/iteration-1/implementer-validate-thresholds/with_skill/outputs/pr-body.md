<!-- PR title: feat: validate dealership thresholds (closes #90) -->
<!-- base: dev  head: feat/90-validate-thresholds (dry run: committed on `eval` as 70fe190) -->

Closes #90

## Summary

`AgingPolicy` gets the pure rule the dealerships module will call before it writes a dealership's watch/aging thresholds (D3, §4.4). It mirrors `dealership_thresholds_chk`, so bad input gets a clear 400 instead of a constraint error from Postgres.

```text
validateThresholds({ watch, aging })
  watch or aging not an integer   -> { ok: false, code: 'INVALID_THRESHOLDS', reason: 'watch and aging must be whole numbers of days' }
  watch < 1                       -> { ok: false, ..., reason: 'watch must be at least 1' }
  watch >= aging                  -> { ok: false, ..., reason: 'watch must be less than aging' }
  aging > 3650                    -> { ok: false, ..., reason: 'aging must be at most 3650' }
  otherwise                       -> { ok: true }
```

```diff
 apps/api/src/modules/inventory/domain/aging-policy.ts
   tierOf
   bucketOf
+  type ThresholdsCheck
+  validateThresholds
```

## Evidence

Each acceptance criterion and the test that covers it (`apps/api/test/unit/inventory/aging-policy.spec.ts`, `describe('validateThresholds')`):

| Acceptance criterion | Test |
| --- | --- |
| Valid pairs (1, 2), (60, 90), (3649, 3650) return `{ ok: true }` | `accepts watch %i, aging %i` (one case for each pair) |
| watch < 1 is rejected and the reason names the rule | `rejects watch 0, aging 90: watch must be at least 1`, `rejects watch -5, aging 90: …` |
| watch >= aging is rejected | `rejects watch 90, aging 90: watch must be less than aging`, `rejects watch 91, aging 90: …` |
| aging > 3650 is rejected | `rejects watch 60, aging 3651: aging must be at most 3650` |
| Non-integer values are rejected | `rejects watch 60.5, aging 90: …`, `rejects watch 60, aging 90.5: …`, `rejects watch NaN, aging 90: watch and aging must be whole numbers of days` |
| 100% coverage on `src/modules/inventory/domain/**` | `vitest run --project unit --coverage`: no domain threshold error; domain-only report is 100% statements, branches, functions and lines |

- **Before:** `validateThresholds is not a function`; 3 of 15 tests failed (cycle 1), then 8 of 23 failed (cycle 2, rejection cases against the always-`ok` stub).
- **After:** 23 of 23 tests pass in the file, 38 of 38 in the unit project.

<details><summary>Domain coverage</summary>

```text
=============================== Coverage summary ===============================
Statements   : 100% ( 7/7 )
Branches     : 100% ( 22/22 )
Functions    : 100% ( 3/3 )
Lines        : 100% ( 7/7 )
================================================================================
```

</details>

`lint`, `typecheck` and `format:check` pass. `pnpm verify` was not run in this dry run (it needs Docker for the integration project). The unit-only coverage run fails the **global** 80% gate on `src/shared` and `modules/health`, because only integration tests cover those files. `eval-base` fails the same way without this change (60% lines), so the change does not cause it. CI runs every project and is the real gate.

## Deviations

None. Built as the issue's `## Decisions` 1–3 state: pure TS in `aging-policy.ts`, the rule copied from `dealership_thresholds_chk`, and no endpoint.

## Manual steps

None.

## Doc impact

- `CLAUDE.md`: the `AgingPolicy` invariant now lists `validateThresholds` as built (it said "later"); only `toStockedOnBounds` is left as "later".
- `docs/system-design.md`: the `AgingPolicy` bullet now names `validateThresholds` and its rule.
- No ADR: it implements D3 as written. No diagram or `GLOSSARY.md` change: neither shows `AgingPolicy`'s functions.

## Merge Danger

**Door:** two-way

A new pure function with no callers yet. Reverting it removes nothing that runs.

**Blast Radius:** none

Nothing calls it until the dealerships settings endpoint (build step 6).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
