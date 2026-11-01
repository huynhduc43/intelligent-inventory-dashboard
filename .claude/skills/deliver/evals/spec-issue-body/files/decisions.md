## Decisions (settled by the grill)

1. Actions stay append-only (D4). A note fix is a new `vehicle_action` row with `corrects_action_id` pointing at the original; the original row is never updated. The newest row by `id` is the current action.
2. The fix is allowed only while `$now - original.created_at <= 15 minutes`, with `$now` from the injected `Clock`, checked inside one conditional `INSERT ... SELECT ... WHERE` statement. 0 rows -> re-read: original or vehicle missing -> 404, otherwise 409 `CORRECTION_WINDOW_CLOSED`.
3. Only the original author may correct (`created_by = current user`); another member with `vehicle_action:create` gets 403 `NOT_ACTION_AUTHOR`. Non-members get 404.
4. The vehicle must still be `IN_STOCK` (D5); otherwise 409 `VEHICLE_NOT_IN_STOCK`.
5. Endpoint: `POST /api/v1/dealerships/{d}/vehicles/{v}/actions/{a}/corrections` with `{note}` -> 201 and the new action, `Location` header.
6. Schema: nullable `vehicle_action.corrects_action_id` FK to `vehicle_action(id)`. Recorded as ADR 0005 (extends D4, supersedes nothing).
