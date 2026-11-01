# Inventory: validate dealership thresholds (#90)

## What to build

A pure rule `validateThresholds(t: Thresholds)` in `AgingPolicy`, which the dealerships module will call before it writes a dealership's watch/aging thresholds (D3, §4.4). It mirrors the DB constraint `dealership_thresholds_chk` so a bad request gets a clear 400 before reaching Postgres.

## Acceptance criteria

- [ ] Valid pairs return `{ ok: true }`: (1, 2), (60, 90), (3649, 3650).
- [ ] Invalid input returns `{ ok: false, code: 'INVALID_THRESHOLDS', reason }`, with a reason naming the broken rule, for: watch < 1, watch >= aging, aging > 3650, and non-integer values.
- [ ] 100% coverage on `src/modules/inventory/domain/**` stays green.

## Decisions

1. Pure TypeScript in `src/modules/inventory/domain/aging-policy.ts`, no I/O, no Nest, matching the existing `tierOf`/`bucketOf` style.
2. The rule is `Number.isInteger(watch) && Number.isInteger(aging) && 1 <= watch && watch < aging && aging <= 3650`, the same as `dealership_thresholds_chk`.
3. No endpoint in this issue; the dealerships module wires it in build step 6.

## Design refs

D3, §4.4, §4.15 (D3 tiers: threshold validation).
