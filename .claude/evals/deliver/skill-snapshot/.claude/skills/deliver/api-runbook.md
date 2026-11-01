# Running the API for a walk-through

Used by `deliver-tester` (acceptance run) and by `deliver-implementer` when it reproduces a tester failure. Read the worktree's `README.md` first: when it documents how to run the API, its commands win over this page.

## Start

```bash
nvm use && pnpm install                            # in the worktree under test
docker compose up -d postgres                      # when docker-compose.yml exists
```

Before `docker-compose.yml` exists, run Postgres with the image tag the integration tests pin (grep `PostgreSqlContainer(` under `apps/api/test`): `docker run -d --name iid-walk -p 55432:5432 -e POSTGRES_PASSWORD=postgres <image>`.

A fresh worktree has no `apps/api/.env`. Copy `apps/api/.env.example` and fill the required values (§4.13): `DATABASE_URL` pointing at the database above, `JWT_SECRET` from `openssl rand -base64 32`. Then run the migrate and seed scripts listed in `apps/api/package.json` (the seed is §4.14: three dealerships, `admin@…`, `manager@…`, `viewer@…`).

```bash
pnpm --filter @inventory/api dev                   # run_in_background
```

Wait with Monitor until `curl -sf http://localhost:3000/health/ready` succeeds.

When a step above has no script or file yet, the feature predates it: report which step is missing as an environment blocker, not a defect.

## Drive the API

```bash
TOKEN=$(curl -s localhost:3000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"manager@…","password":"…"}' | jq -r .accessToken)
curl -si localhost:3000/api/v1/dealerships/<d>/vehicles?tier=AGING -H "authorization: Bearer $TOKEN"
```

- Log in as the role each criterion names: the seed gives an Admin, a Manager and a Viewer, and a dealership the Viewer is not a member of (expect `404`, not `403`).
- Keep `-i` so the status line, `X-Request-ID` and `Cache-Control` are in the transcript. Errors must be `application/problem+json` with the `code` the contract names.
- Criteria that depend on the time of day or a DST change cannot be pinned in a running app (the `Clock` is real). Cite the integration test that pins the clock and its result instead, and say so in the table.

## Evidence

Save each criterion's transcript to `<scratchpad>/ac<n>.txt`: the exact command, the status line, the relevant headers and the body (trim long lists to the rows that prove the point). Read each transcript before you cite it, and confirm it shows what it claims.

## Stop

Stop the dev server, then `docker compose down` (or `docker rm -f iid-walk`). Leave `.env` out of git: it is ignored, so never force-add it.
