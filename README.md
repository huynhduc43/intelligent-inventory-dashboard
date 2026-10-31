# Intelligent Inventory Dashboard

Backend for a dealership inventory dashboard (Keyloop technical assessment, Scenario B). It gives dealership managers a live view of their vehicle stock:

- **Inventory list** filterable by make, model and age.
- **Aging stock**: vehicles in stock for more than 90 days (configurable per dealership) are flagged.
- **Actions**: managers log a status or planned action per vehicle (e.g. "Price Reduction Planned"), kept as a history.

A REST API (NestJS 12, TypeScript) on PostgreSQL. The full design (data model, API, decisions and trade-offs) is in [`docs/research/backend-architecture.md`](docs/research/backend-architecture.md).

> **Status:** project skeleton. Tooling, health checks and the aging rules (`AgingPolicy`) with tests are in place; the database, auth and the inventory endpoints follow the build order in §4.16 of the design doc.

## Prerequisites

- Node.js 24 (`nvm use` reads `.nvmrc`)
- pnpm, via corepack: `corepack enable` (the version is pinned in `package.json`)
- Docker, for integration tests (Testcontainers) once they exist

## Getting started

```sh
nvm use
corepack enable
pnpm install          # also installs the git hooks
pnpm dev              # API on http://localhost:3000 (set PORT to change), restarts on change
```

Check it is up:

```sh
curl localhost:3000/health/live    # 200 while the process runs
curl localhost:3000/health/ready   # 200 when it can serve traffic (will include the Postgres ping)
```

Production build:

```sh
pnpm build
node apps/api/dist/main.js
```

## Scripts

Run from the repo root; Turborepo runs them in every workspace package.

| Command                 | Does                                                     |
| ----------------------- | -------------------------------------------------------- |
| `pnpm dev`              | Start the API in watch mode                              |
| `pnpm build`            | Compile to `apps/api/dist`                               |
| `pnpm lint`             | ESLint, zero warnings allowed                            |
| `pnpm typecheck`        | `tsc --noEmit`                                           |
| `pnpm test`             | Unit tests                                               |
| `pnpm test:integration` | Integration tests against real Postgres (needs Docker)   |
| `pnpm test:cov`         | All tests with coverage: 80% global, 100% on domain code |
| `pnpm format`           | Prettier                                                 |

Run one test file or test by name:

```sh
pnpm --filter @inventory/api exec vitest run test/unit/inventory/aging-policy.spec.ts
pnpm --filter @inventory/api exec vitest run -t "tierOf"
```

## Project structure

```
apps/api/            NestJS API (the whole backend, one modular monolith)
  src/modules/       one folder per module; pure business rules in <module>/domain/
  test/unit/         fast tests, no I/O
  test/integration/  tests against Postgres via Testcontainers
docs/research/       design document
```

## Contributing

Branch names, commit messages, naming rules, git hooks and the coverage policy are in [`CONTRIBUTING.md`](CONTRIBUTING.md).
