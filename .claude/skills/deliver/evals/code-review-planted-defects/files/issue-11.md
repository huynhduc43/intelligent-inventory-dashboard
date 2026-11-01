# Actions: log and list vehicle actions (#11)

## Acceptance criteria
- [ ] `GET /dealerships/{d}/vehicles/{v}/actions` returns the vehicle's actions newest first (`vehicle_action:read`).
- [ ] `POST /dealerships/{d}/vehicles/{v}/actions` with `{actionType, note?}` logs an action on an `IN_STOCK` vehicle -> 201 (`vehicle_action:create`).
- [ ] A `RESERVED` or `SOLD` vehicle -> 409 `VEHICLE_NOT_IN_STOCK`; a missing vehicle -> 404.
- [ ] The response includes `daysInStock` for the vehicle.

## Decisions
1. The insert is one conditional `INSERT ... SELECT ... WHERE status = 'IN_STOCK'` (P3, D5); 0 rows -> re-read -> 404 or 409.
2. `daysInStock` comes from Postgres (`today_local` from the guard context minus `stocked_on`), never from time-zone maths in Node.
