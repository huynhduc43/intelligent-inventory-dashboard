Title: `feat: add validateThresholds to AgingPolicy (closes #90)`

Closes #90

## What

Adds `validateThresholds(t: Thresholds)` to `AgingPolicy` (`apps/api/src/modules/inventory/domain/aging-policy.ts`). It's a pure check with the same rule as the DB constraint `dealership_thresholds_chk` (D3, §4.4): `Number.isInteger(watch) && Number.isInteger(aging) && 1 <= watch && watch < aging && aging <= 3650`. It returns `{ ok: true }` or `{ ok: false, code: 'INVALID_THRESHOLDS', reason }`, where `reason` names the first rule broken, checked in this order: integers, watch ≥ 1, watch < aging, aging ≤ 3650. Per Decision 3 it adds no endpoint. The dealerships module wires it in build step 6.

## Evidence

All tests are in `apps/api/test/unit/inventory/aging-policy.spec.ts`, `describe('validateThresholds')`.

| Acceptance criterion | Test |
| --- | --- |
| Valid pairs (1, 2), (60, 90), (3649, 3650) return `{ ok: true }` | `accepts watch 1, aging 2`, `accepts watch 60, aging 90`, `accepts watch 3649, aging 3650` |
| watch < 1 → `INVALID_THRESHOLDS` with a reason | `rejects watch 0, aging 90: watch must be at least 1` |
| watch >= aging → `INVALID_THRESHOLDS` with a reason | `rejects watch 90, aging 90: watch must be less than aging`, `rejects watch 91, aging 90: watch must be less than aging` |
| aging > 3650 → `INVALID_THRESHOLDS` with a reason | `rejects watch 60, aging 3651: aging must be at most 3650` |
| Non-integer values → `INVALID_THRESHOLDS` with a reason | `rejects watch 60.5, aging 90: …integers`, `rejects watch 60, aging 90.5: …integers`, `rejects watch NaN, aging 90: …integers` |
| 100% coverage on `src/modules/inventory/domain/**` | `vitest run --project unit --coverage`: `aging-policy.ts` 100% lines, branches, functions and statements. The table lists no domain row because it hides fully covered files, and the per-glob threshold raised no error. |

<details><summary>Test run</summary>

```
 Test Files  3 passed (3)
      Tests  37 passed (37)
```

`format:check`, `lint` and `typecheck` pass. The unit-only coverage run fails the **global** 80% threshold (lines 63.15%), and it fails the same way on `dev` before this change (60%). `health` and `db.ts` are covered only by the integration project. `pnpm verify`, which runs all projects, was not run here because it needs Docker.

</details>

## Deviations

None.

## Manual steps

None.

## Doc impact

None. `docs/system-design.md`, `docs/diagrams/schema-er.*` and §4.4 of the design doc already state the rule `1 ≤ watch < aging ≤ 3650`. There's no new decision, so no ADR. The README Status already lists `AgingPolicy` with tests. One small update to consider: CLAUDE.md's invariant line still reads "later `validateThresholds`, `toStockedOnBounds`", and only `toStockedOnBounds` is still to come.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
