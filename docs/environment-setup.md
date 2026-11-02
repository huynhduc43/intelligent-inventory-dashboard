# Environment setup

Steps that live outside the repo, per environment. A PR that adds one records it here (CONTRIBUTING.md **Pull requests**).

## Environment variables

Validated at startup by `apps/api/src/shared/config.ts`; the api exits non-zero and names every bad variable (§4.13).

| Variable                       | Required | Default | Notes                                                           |
| ------------------------------ | -------- | ------- | --------------------------------------------------------------- |
| `DATABASE_URL`                 | yes      | —       | `postgres://user:password@host:port/db`                         |
| `JWT_SECRET`                   | yes      | —       | at least 32 characters; generate with `openssl rand -base64 48` |
| `PORT`                         | no       | `3000`  |                                                                 |
| `LOG_LEVEL`                    | no       | `info`  | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`    |
| `DB_STATEMENT_TIMEOUT_MS`      | no       | `5000`  | Postgres `statement_timeout` on every pooled connection         |
| `JWT_TTL_S`                    | no       | `3600`  |                                                                 |
| `SEED_PASSWORD`                | no       | random  | `db:seed` only: password for new users, at least 15 characters  |
| `SEED_VEHICLES_PER_DEALERSHIP` | no       | `250`   | `db:seed` only: vehicles per dealership (0 to 1000000)          |

## Local development (host Node)

1. Start Postgres: `docker compose up -d postgres`.
2. `cp apps/api/.env.example apps/api/.env` and adjust if needed (the example matches the Compose database).
3. Apply migrations: `pnpm --filter @inventory/api db:migrate`.
4. Seed the demo users: `pnpm --filter @inventory/api db:seed` (see Seed data).
5. `pnpm dev`, then `curl localhost:3000/health/ready`.

Git hooks run in a non-interactive shell that does not read `.nvmrc`, so they can run on the wrong Node (`Unsupported engine: wanted >=24.7`). Once per machine, make them load nvm: put `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use >/dev/null 2>&1` in `~/.config/husky/init.sh` (Husky sources it before every hook; `nvm use` reads the repo's `.nvmrc`). `.npmrc` sets `engine-strict=true`, so `pnpm install` on a Node below the `engines` floor fails at once instead of at the first `crypto.argon2` call.

Re-run step 3 whenever a PR adds a migration under `apps/api/db/migrations/`.

## Seed data

After migrating, `pnpm --filter @inventory/api db:seed` creates the London, New York and Sydney dealerships and `admin@`, `manager@`, `viewer@example.dev` users. It is idempotent and never changes existing rows. Set `SEED_PASSWORD` (at least 15 characters) to give new users that password; otherwise a random password per new user is printed once, and not again on re-runs. It also adds `SEED_VEHICLES_PER_DEALERSHIP` (default 250) demo vehicles per dealership with deterministic ids, ages 0 to 200 days, four in-stock vehicles at exactly watch−1, watch, aging and aging+1 days, about 10% `RESERVED` and 10% `SOLD`, and one re-acquired VIN; a re-run adds only missing rows. Ages are fixed on the day of seeding. Set `SEED_VEHICLES_PER_DEALERSHIP=2000` to seed enough rows for `EXPLAIN ANALYZE`.

## Docker Compose

`docker compose up --build` starts `postgres`, runs the one-off `migrate` service, then starts `api` on port 3000. Compose sets a dev-only `JWT_SECRET`; nothing else is needed. To log in, seed once after the stack is up: `docker compose run --rm -e SEED_PASSWORD=<at least 15 characters> migrate node db/seed.ts` (without `SEED_PASSWORD` the random passwords are printed once). `docker compose down -v` also drops the database volume.

## Tests

`pnpm test:integration` and `pnpm verify` need a running Docker daemon (Testcontainers pulls `postgres:17.11-alpine` on first run).

## Deployed environments

None yet. Before the first deploy: set `DATABASE_URL` and a freshly generated `JWT_SECRET` as secrets, and run `node db/migrate.ts` from the api image once per release, before the new api version starts. The app never migrates at boot.
