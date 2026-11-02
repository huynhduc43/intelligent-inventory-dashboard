#!/usr/bin/env bash
# Walks the routes that exist today: login, /me and the health checks.
# Usage: EMAIL=... PASSWORD=... bash docs/api/curl-examples.sh   (BASE_URL defaults to http://localhost:3000)
# Needs curl and jq. Later slices append their routes.
set -euo pipefail

BASE_URL=${BASE_URL:-http://localhost:3000}
: "${EMAIL:?set EMAIL to a seeded user}" "${PASSWORD:?set PASSWORD (pnpm db:seed prints them)}"

show() { echo; echo "== $1"; }

show "POST /api/v1/auth/login"
login=$(curl -sS --fail-with-body -X POST "$BASE_URL/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg e "$EMAIL" --arg p "$PASSWORD" '{email:$e,password:$p}')")
echo "$login" | jq .
token=$(echo "$login" | jq -r .accessToken)

show "GET /api/v1/me"
curl -sS --fail-with-body "$BASE_URL/api/v1/me" -H "Authorization: Bearer $token" | jq .

show "GET /health/live"
curl -sS --fail-with-body "$BASE_URL/health/live" | jq .

show "GET /health/ready"
curl -sS --fail-with-body "$BASE_URL/health/ready" | jq .
