# Actions: log and list vehicle actions (#11)

Spec issue: #10 (Actions). Design refs: D4, D5, D11, D16, §4.6, §4.7, §4.8.

## Acceptance criteria
- [ ] `POST /api/v1/dealerships/{d}/vehicles/{v}/actions` with `{actionType, note?}` logs an action on an `IN_STOCK` vehicle -> 201 + `Location` (`vehicle_action:create`).
- [ ] `RESERVED` or `SOLD` vehicle -> 409 `VEHICLE_NOT_IN_STOCK`; missing vehicle -> 404 `NOT_FOUND`.
- [ ] Non-member -> 404; member without `vehicle_action:create` (VIEWER) -> 403.
- [ ] `GET .../actions` returns `{items}` newest first (`vehicle_action:read`).

## Decisions
1. Conditional insert `INSERT ... SELECT ... WHERE status = 'IN_STOCK'` (D5, P3).
2. Note at most 1,000 characters (D4), validated by the DTO.
3. No new configuration.

---
Comment `Contract`: POST errors: 400 VALIDATION_FAILED, 403 FORBIDDEN, 404 NOT_FOUND, 409 VEHICLE_NOT_IN_STOCK. GET: 200 {items}, 403, 404.
Comment `Chosen: as drafted`.
