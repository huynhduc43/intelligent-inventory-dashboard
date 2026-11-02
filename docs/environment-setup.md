# Environment setup

Steps that live outside the repo, per environment. A PR that adds one records it here (CONTRIBUTING.md **Pull requests**).

## Environment variables

Validated at startup by `apps/api/src/shared/config.ts`; the api exits non-zero and names every bad variable (§4.13).

| Variable                  | Required | Default | Notes                                                           |
| ------------------------- | -------- | ------- | --------------------------------------------------------------- |
| `DATABASE_URL`            | yes      | —       | `postgres://user:password@host:port/db`                         |
| `JWT_SECRET`              | yes      | —       | at least 32 characters; generate with `openssl rand -base64 48` |
| `PORT`                    | no       | `3000`  |                                                                 |
| `LOG_LEVEL`               | no       | `info`  | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`    |
| `DB_STATEMENT_TIMEOUT_MS` | no       | `5000`  | Postgres `statement_timeout` on every pooled connection         |
| `JWT_TTL_S`               | no       | `3600`  |                                                                 |

## Local development (host Node)

1. Start Postgres: `docker compose up -d postgres`.
2. `cp apps/api/.env.example apps/api/.env` and adjust if needed (the example matches the Compose database).
3. Apply migrations: `pnpm --filter @inventory/api db:migrate`.
4. `pnpm dev`, then `curl localhost:3000/health/ready`.

Git hooks run in a non-interactive shell that does not read `.nvmrc`, so they can run on the wrong Node (`Unsupported engine: wanted >=24.7`). Once per machine, make them load nvm: put `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use >/dev/null 2>&1` in `~/.config/husky/init.sh` (Husky sources it before every hook; `nvm use` reads the repo's `.nvmrc`).

Re-run step 3 whenever a PR adds a migration under `apps/api/db/migrations/`.

## Docker Compose

`docker compose up --build` starts `postgres`, runs the one-off `migrate` service, then starts `api` on port 3000. Compose sets a dev-only `JWT_SECRET`; nothing else is needed. `docker compose down -v` also drops the database volume.

## Tests

`pnpm test:integration` and `pnpm verify` need a running Docker daemon (Testcontainers pulls `postgres:17.11-alpine` on first run).

## Deployed environments

None yet. Before the first deploy: set `DATABASE_URL` and a freshly generated `JWT_SECRET` as secrets, and run `node db/migrate.ts` from the api image once per release, before the new api version starts. The app never migrates at boot.
