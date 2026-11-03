# Contributing

## Setup

Node 24 (`nvm use`; pnpm itself runs scripts on the Node in `devEngines.runtime` in `package.json`) and pnpm via corepack (`corepack enable`, version pinned in `package.json`; in agent shells call `corepack pnpm`, since a bare `pnpm` can be an older global install that ignores the pin, and check `git diff --quiet pnpm-lock.yaml` after installing). `pnpm install` also installs the git hooks.

## Branches

Never commit or push directly to `dev` or `main`: they only receive changes through a PR. Branch off `dev` and open PRs into `dev`; `main` is the release branch.

`<type>/<kebab-description>`, for example `feat/vehicle-list-filters` or `fix/dst-day-count`. When the work tracks an issue, put its number first: `feat/12-vehicle-list-filters`. Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `perf`, `build`. The pre-push hook rejects other names.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), checked by commitlint (`@commitlint/config-conventional`, scope required): `type(scope): subject (#NNN)`, e.g. `feat(inventory): add tier filter (#12)`. The scope is the module or area touched (`inventory`, `auth`, `shared`, `docs`, `ci`, `deps`). The `(#NNN)` suffix only when the work tracks an issue; never invent one.

## Pull requests

- Target `dev`. The title is a commit header (see **Commits**), e.g. `feat(inventory): add tier filter (#12)`; the `PR title` workflow checks it with commitlint (CI only: a title does not exist before the PR). Close the issue in the description (`Closes #NNN`).
- Run `pnpm verify` (the same checks as CI: `install --frozen-lockfile`, which also enforces the release-age cooldown, `format:check`, `lint`, `typecheck`, `test:cov`, and the `/deliver` evidence-check tests; needs Docker; CI also runs `docker build -f apps/api/Dockerfile .`) before opening a PR. Add new checks to that script.
- A change that needs a step outside the repo (env var or secret, DB migration to run, cloud/console setting) records it in `docs/environment-setup.md` in the same PR, per environment, and lists it under **Manual steps** in the PR description.
- Under **Doc impact**, list each doc the change updates, one line with what changed, or `none` with the reason. Check: the `docs/system-design.md` section whose component, flow, schema, technology or observability changed; each diagram in `docs/diagrams/` that shows it (edit the HTML with `diagram-design`, re-export the SVG); `docs/adr/` (a new decision, or one that supersedes a D-number or an ADR); when an ADR amends or supersedes another, every doc that cites the older ADR's number (grep for it); `GLOSSARY.md`; the **Status** in README.md and CLAUDE.md.

## Hooks

| Hook       | Runs                                                                 |
| ---------- | -------------------------------------------------------------------- |
| pre-commit | lint-staged: `eslint --fix` + `prettier --write` on staged files     |
| commit-msg | commitlint                                                           |
| pre-push   | branch-name check, then `turbo run typecheck test`                   |
| CI         | `format:check`, `lint`, `typecheck`, `test:cov` (coverage gate here) |
| PR title   | commitlint on the PR title                                           |

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

Coverage (`pnpm test:cov`, gated in CI): **80%** lines, branches, functions and statements globally; **100%** for `src/modules/*/domain/**`. `main.ts`, `export-openapi.ts`, `explain-queries.ts`, `*.module.ts` and `src/shared/schema.ts` (declarations only; its migration is checked by the DB integration test) are excluded.
