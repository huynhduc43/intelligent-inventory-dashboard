open
(dry run) F1 inline apps/api/src/modules/actions/actions.service.ts:14 [business-review r1] Spec · blocker: RESERVED vehicles accept actions
(dry run) F2 inline apps/api/src/modules/actions/actions.controller.ts:19 [business-review r1] Spec · blocker: non-member gets 403 from a JWT-claim check, bypassing DealershipGuard
(dry run) F3 inline apps/api/src/modules/actions/actions.service.ts:19 [business-review r1] Spec · major: 409 code NOT_IN_STOCK instead of VEHICLE_NOT_IN_STOCK
(dry run) F4 inline apps/api/src/modules/actions/actions.service.ts:2 [business-review r1] Spec · major: GET on a missing vehicle returns 200 [] instead of 404
(dry run) F5 inline apps/api/src/modules/actions/actions.controller.ts:16 [business-review r1] Spec · major: 201 without Location header
(dry run) F6 inline apps/api/src/modules/actions/actions.service.ts:15 [business-review r1] Standards · major: POST returns snake_case raw row
(dry run) F7 inline apps/api/src/shared/config.ts:15 [business-review r1] Spec · major: new required ACTION_NOTE_MAX_LENGTH config contradicts Decisions 2-3, not in environment-setup.md or Manual steps
(dry run) F8 PR-level [business-review r1] Spec · blocker: no tests in diff; §4.15 D5, D4/P3, D15/D16 rows missing; Evidence unbacked
(dry run) F9 PR-level [business-review r1] Spec · minor: no Doc impact section; Status lines in CLAUDE.md, README.md, system-design.md not updated
