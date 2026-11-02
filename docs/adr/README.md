# Decisions

Two places hold this project's accepted decisions:

1. **D1–D19 and P1–P3** in [`docs/research/backend-architecture.md`](../research/backend-architecture.md) §2 and §3: the original design, made before any code. That doc is frozen; a decision there changes only through a new ADR here, and the old row is then marked superseded with a link to it.
2. **The ADRs in this folder**, `NNNN-slug.md`, for every decision made since. Format: `mattpocock-skills:domain-modeling` (`ADR-FORMAT.md`). Add each new ADR to the table below in the same PR.

[`docs/system-design.md`](../system-design.md) describes the system as it is now and cites both.

## Original design (backend-architecture.md)

| Id  | Topic                                              |
| --- | -------------------------------------------------- |
| D1  | Age counts from `stocked_on`                       |
| D2  | Calendar days in the dealership's time zone        |
| D3  | Tiers and per-dealership thresholds                |
| D4  | Action types, append-only                          |
| D5  | Actions allowed on any `IN_STOCK` vehicle          |
| D6  | Vehicle lifecycle                                  |
| D7  | List default and filters                           |
| D8  | Data sources: seed plus API                        |
| D9  | "Real-time" = computed on every read, client polls |
| D10 | Dashboard KPIs and breakdowns                      |
| D11 | "Aging with no action"                             |
| D12 | KPIs count `IN_STOCK` only                         |
| D13 | Auth: email + password, one access JWT             |
| D14 | Password rule                                      |
| D15 | Guards check permissions, never roles              |
| D16 | Tenancy; non-member gets 404                       |
| D17 | Provisioning from the seed script                  |
| D18 | VIN rules                                          |
| D19 | Audit trail via `created_by` / `updated_by`        |
| P1  | Time-derived tiers must be time-zone-correct       |
| P2  | Status changes must not race into an illegal state |
| P3  | Two managers act on the same car                   |

## ADRs

| ADR                                                         | Decision                                                                          | Supersedes              |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------- |
| [0001](0001-migrations-run-outside-the-app.md)              | Migrations run outside the app, not at boot                                       | —                       |
| [0002](0002-updated-at-set-from-clock.md)                   | `updated_at` is set by the service from `Clock`                                   | —                       |
| [0003](0003-health-bodies-are-not-problem-json.md)          | Health endpoints keep Terminus's body, not problem+json                           | —                       |
| [0004](0004-text-check-and-app-side-timezone-validation.md) | Enums are `text` + `CHECK`; time-zone validity checked in app                     | —                       |
| [0005](0005-request-validation-with-zod.md)                 | Request validation uses zod via Nest's Standard Schema pipe                       | §4.1 (`ValidationPipe`) |
| [0006](0006-request-logger-ahead-of-body-parser.md)         | `pino-http` mounted ahead of the body parser                                      | —                       |
| [0007](0007-problem-type-and-code-for-every-status.md)      | Minted problem `type` and a `code` for every status                               | —                       |
| [0008](0008-authentication-is-global-and-fail-closed.md)    | Global fail-closed `JwtAuthGuard`; `@RequirePermission` applies `DealershipGuard` | —                       |
| [0009](0009-seed-script-is-self-contained.md)               | Seed script is self-contained and repeats the password hash                       | —                       |
| [0010](0010-openapi-from-code-and-committed-export.md)      | OpenAPI from code at `/docs`, committed `openapi.json` exported by a script       | —                       |
