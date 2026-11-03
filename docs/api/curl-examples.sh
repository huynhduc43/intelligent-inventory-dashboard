#!/usr/bin/env bash
# Walks every route of the API against a seeded database: login, /me, settings, dashboard, vehicle list, intake, detail,
# actions, status changes and health. It creates its own vehicle (random VIN) and writes the dealership's settings back
# unchanged, so rerunning it collides with nothing. Stops at the first failing call and prints its problem+json body.
# Usage: EMAIL=admin@example.dev PASSWORD=... bash docs/api/curl-examples.sh
#   BASE_URL defaults to http://localhost:3000; DEALERSHIP_ID defaults to the user's first membership.
# EMAIL must be a user with every permission (the seeded admin). Needs curl and jq.
set -euo pipefail

BASE_URL=${BASE_URL:-http://localhost:3000}
: "${EMAIL:?set EMAIL to a seeded user with every permission, e.g. admin@example.dev}" "${PASSWORD:?set PASSWORD (pnpm db:seed prints them)}"

show() { echo; echo "== $*"; }
# call METHOD PATH [JSON_BODY]: prints the response body; on 4xx/5xx prints the problem+json body to stderr and fails.
call() {
  local method=$1 path=$2 body=${3:-} out
  local args=(-sS --fail-with-body -X "$method" "$BASE_URL$path")
  if [ -n "${token:-}" ]; then args+=(-H "Authorization: Bearer $token"); fi
  if [ -n "$body" ]; then args+=(-H 'Content-Type: application/json' -d "$body"); fi
  out=$(curl "${args[@]}") || { echo "$out" >&2; return 1; }
  echo "$out"
}

show "POST /api/v1/auth/login"
login=$(call POST /api/v1/auth/login "$(jq -n --arg e "$EMAIL" --arg p "$PASSWORD" '{email:$e,password:$p}')")
echo "$login" | jq .
token=$(echo "$login" | jq -r .accessToken)

show "GET /api/v1/me"
me=$(call GET /api/v1/me)
echo "$me" | jq .
d=${DEALERSHIP_ID:-$(echo "$me" | jq -r '.memberships[0].dealershipId')}
base=/api/v1/dealerships/$d

show "GET $base/settings"
settings=$(call GET "$base/settings")
echo "$settings" | jq .

show "PATCH $base/settings (the values just read, so nothing changes)"
call PATCH "$base/settings" "$(echo "$settings" | jq -c '{timezone,watchDays,agingDays}')" | jq .

show "GET $base/dashboard"
call GET "$base/dashboard" | jq .

show "GET $base/vehicles (default: in stock, oldest first, limit 50; first 2 items)"
call GET "$base/vehicles" | jq '{total, items: .items[:2]}'

show "GET $base/vehicles?tier=AGING&limit=5"
call GET "$base/vehicles?tier=AGING&limit=5" | jq .

show "POST $base/vehicles (random VIN)"
vin=$(LC_ALL=C tr -dc 'A-HJ-NPR-Z0-9' </dev/urandom | head -c 17 || true)
vehicle=$(call POST "$base/vehicles" "$(jq -nc --arg vin "$vin" \
  '{vin:$vin,make:"Toyota",model:"Corolla",modelYear:2022,mileage:12000,listPrice:"18500.00",stockedOn:"2026-01-15"}')")
echo "$vehicle" | jq .
v=$(echo "$vehicle" | jq -r .id)

show "GET $base/vehicles/$v"
call GET "$base/vehicles/$v" | jq .

show "POST $base/vehicles/$v/actions"
call POST "$base/vehicles/$v/actions" '{"actionType":"PRICE_REDUCTION_PLANNED","note":"Drop 5% next week"}' | jq .

show "GET $base/vehicles/$v/actions"
call GET "$base/vehicles/$v/actions" | jq .

show "PATCH $base/vehicles/$v/status -> RESERVED"
call PATCH "$base/vehicles/$v/status" '{"status":"RESERVED"}' | jq .

show "PATCH $base/vehicles/$v/status -> SOLD"
call PATCH "$base/vehicles/$v/status" '{"status":"SOLD"}' | jq .

show "GET /health/live"
curl -sS --fail-with-body "$BASE_URL/health/live" | jq .

show "GET /health/ready"
curl -sS --fail-with-body "$BASE_URL/health/ready" | jq .
