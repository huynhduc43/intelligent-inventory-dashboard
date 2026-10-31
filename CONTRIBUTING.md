# Contributing

## Setup

Node 24 (`nvm use`) and pnpm via corepack (`corepack enable`, version pinned in `package.json`). `pnpm install` also installs the git hooks.

## Branches

`<type>/<kebab-description>`, for example `feat/vehicle-list-filters` or `fix/dst-day-count`. Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `perf`, `build`. Branch off `dev` and open PRs into `dev`; `main` is the release branch. The pre-push hook rejects other names.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), checked by commitlint (`@commitlint/config-conventional`): `type(scope?): subject`, e.g. `feat(inventory): add tier filter`. Scope is optional, usually the module name.

## Hooks

| Hook       | Runs                                                                 |
| ---------- | -------------------------------------------------------------------- |
| pre-commit | lint-staged: `eslint --fix` + `prettier --write` on staged files     |
| commit-msg | commitlint                                                           |
| pre-push   | branch-name check, then `turbo run typecheck test`                   |
| CI         | `format:check`, `lint`, `typecheck`, `test:cov` (coverage gate here) |

## Naming

| What                      | Convention                                                                  |
| ------------------------- | --------------------------------------------------------------------------- |
| Files                     | kebab-case, `<name>.<role>.ts`: `vehicles.controller.ts`, `aging-policy.ts` |
| Pure business rules       | `src/modules/<module>/domain/` (no I/O, no Nest, no DB)                     |
| Variables, functions      | camelCase                                                                   |
| Classes, types, enums     | PascalCase, no `I` prefix on interfaces                                     |
| Module-level constants    | camelCase or UPPER_CASE                                                     |
| Enum members, error codes | UPPER_SNAKE: `IN_STOCK`, `INVALID_TRANSITION`                               |
| DB tables and columns     | singular snake_case: `vehicle_action.created_by`, camelCase in Drizzle      |
| API paths                 | plural kebab-case nouns: `/dealerships/{id}/vehicles`                       |
| JSON fields, query params | camelCase                                                                   |
| Permissions               | `resource:verb`: `vehicle_action:create`                                    |
| Env vars                  | UPPER_SNAKE                                                                 |

The identifier rules are enforced by `@typescript-eslint/naming-convention`; file names are by review.

## TypeScript and lint

`strict` plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch` (`tsconfig.base.json`). ESLint uses typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`, with zero warnings allowed. Prettier owns formatting. No `console`: log through pino.

## Tests and coverage

Vitest, two projects in `apps/api/vitest.config.ts`:

- `test/unit/**/*.spec.ts`: pure logic, no I/O. Runs on pre-push.
- `test/integration/**/*.spec.ts`: real Postgres via Testcontainers (needs Docker).

Coverage (`pnpm test:cov`, gated in CI): **80%** lines, branches, functions and statements globally; **100%** for `src/modules/*/domain/**`. `main.ts` and `*.module.ts` are excluded.
