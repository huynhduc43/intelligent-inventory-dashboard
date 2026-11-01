open
(dry run, not posted) findings.md#F1 (inline, apps/api/src/modules/actions/actions.service.ts:14): Spec blocker, RESERVED vehicles accepted
(dry run, not posted) findings.md#F2 (inline, apps/api/src/modules/actions/actions.controller.ts:19): Spec blocker, non-member gets 403 from a JWT-claim check
(dry run, not posted) findings.md#F3 (inline, apps/api/src/shared/config.ts:15): Spec blocker, new required env var ACTION_NOTE_MAX_LENGTH against Decision 3, not in environment-setup or Manual steps
(dry run, not posted) findings.md#F4 (inline, apps/api/src/modules/actions/actions.service.ts:19): Spec major, 409 code NOT_IN_STOCK instead of VEHICLE_NOT_IN_STOCK
(dry run, not posted) findings.md#F5 (inline, apps/api/src/modules/actions/actions.controller.ts:20): Spec major, no Location header on 201
(dry run, not posted) findings.md#F6 (inline, apps/api/src/modules/actions/actions.service.ts:15): Standards major, POST returns snake_case fields
(dry run, not posted) findings.md#F7 (inline, apps/api/src/modules/actions/actions.service.ts:2): Spec minor, GET on a missing vehicle returns 200 [] instead of 404
(dry run, not posted) findings.md#F8 (PR-level): Spec blocker, §4.15 integration tests missing, and the Evidence table cites tests that do not exist
(dry run, not posted) findings.md#F9 (PR-level): Spec minor, no Doc impact section and Status lines not updated
