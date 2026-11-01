# Findings, business review round 1 (dry run)

> Saved by the orchestrator from the subagent's hand-back: a harness hook blocked subagents from writing .md report files. Condensed to header, sites and the key sentences of Gap/Source/Fix.

## F1
[business-review r1] Spec · blocker
Sites: apps/api/src/modules/actions/actions.service.ts:14
Gap: Actions may only be logged on an IN_STOCK vehicle and RESERVED must get 409 → the conditional insert uses `AND v.status IN ('IN_STOCK', 'RESERVED')`, so a RESERVED vehicle returns 201.
Source: issue #11 criterion 2; Decision 1; D5; P2; §4.5; CLAUDE.md race-free writes.
Fix: Change the predicate to `v.status = 'IN_STOCK'` and add a RESERVED → 409 integration test.

## F2
[business-review r1] Spec · blocker
Sites: apps/api/src/modules/actions/actions.controller.ts:19
Gap: A non-member must get 404 and membership is re-read per request by DealershipGuard → the controller returns 403 FORBIDDEN when `d` is not in `req.user.dealershipIds`, revealing the dealership exists and reading memberships from the token.
Source: criterion 3; D16; §4.6 guard chain; CLAUDE.md "Non-members get 404, not 403".
Fix: Delete line 19 and rely on DealershipGuard; cover both routes with the D15/D16 route × role test.

## F3
[business-review r1] Spec · blocker
Sites: apps/api/src/shared/config.ts:15, apps/api/src/modules/actions/log-action.dto.ts:6
Gap: The note limit is a fixed 1,000 characters and the issue adds no configuration → the PR adds a required env var `ACTION_NOTE_MAX_LENGTH` (no default): (1) the api refuses to start where it is unset (Compose, .env.example); (2) the step is not in docs/environment-setup.md or §4.13, and the PR says "Manual steps: None" and "Deviations: None"; (3) the DTO reads process.env directly (NaN when unset); (4) a value above 1,000 breaks vehicle_action_note_chk → 500.
Source: Decisions 2 and 3; D4; §4.13; CONTRIBUTING.md Pull requests (environment-setup + Manual steps); CLAUDE.md "Steps outside the repo".
Fix: Remove the env var and use @MaxLength(1000). If a configurable limit is wanted, that is a decision for the user: record it in `## Decisions` and an `Amended:` comment, plus a default, a §4.13 row, docs/environment-setup.md, .env.example and a Manual steps entry.

## F4
[business-review r1] Spec · major
Sites: apps/api/src/modules/actions/actions.service.ts:19
Gap: The 409 carries code VEHICLE_NOT_IN_STOCK → the service throws `NOT_IN_STOCK`.
Source: criterion 2; Contract comment ("409 VEHICLE_NOT_IN_STOCK", Chosen: as drafted); §4.7.
Fix: Throw ConflictException({ code: 'VEHICLE_NOT_IN_STOCK' }) and assert the code.

## F5
[business-review r1] Spec · major
Sites: apps/api/src/modules/actions/actions.controller.ts:20
Gap: 201 must carry a Location header → none is set.
Source: criterion 1; §4.7.
Fix: Set Location from the inserted id; record the target URL in Decisions.

## F6
[business-review r1] Spec · major
Sites: apps/api/src/modules/actions/actions.service.ts:15, :16
Gap: JSON fields are camelCase → POST returns the raw RETURNING * row in snake_case while GET returns camelCase.
Source: CONTRIBUTING.md Naming; §4.7.
Fix: Alias columns or map through one shared mapper.

## F7
[business-review r1] Spec · major
Sites: apps/api/src/modules/actions/actions.service.ts:2, actions.controller.ts:13
Gap: GET returns 404 for a vehicle missing from this dealership → list() returns 200 {items: []}.
Source: §4.7 GET row (200, 404); Contract comment; §4.8.
Fix: 404 via vehicleExists when the list is empty.

## F8
[business-review r1] Spec · blocker
Sites: actions.service.ts:8, actions.controller.ts:16 (no test file in the diff)
Gap: Each §4.15 row needs a test and Evidence maps each criterion → the diff adds no test file; the cited actions.spec.ts is not in the PR; RESERVED, missing-vehicle 404, 400, Location and VIEWER 403 are untested. Missing §4.15 rows D4/P3, D5, D15/D16.
Source: §4.15; criteria 1–4; PR Evidence; CONTRIBUTING.md Tests and coverage.
Fix: Add integration tests for every row and criterion; update Evidence.

## F9
[business-review r1] Spec · major
Sites: apps/api/src/app.module.ts:10, apps/api/src/main.ts:18 (unchanged)
Gap: No ActionsModule wiring and no ValidationPipe, so routes are not mounted and the DTO never runs.
Source: §4.2; Decision 2; Contract (400 VALIDATION_FAILED); §4.8.
Fix: Add actions.module.ts and a global ValidationPipe.

## F10
[business-review r1] Spec · minor
Sites: actions.controller.ts:12, :18
Gap: A malformed :v reaches SQL and gives 500.
Source: Contract error list; §4.8.
Fix: ParseUUIDPipe; map to 404 or 400.
