#!/bin/bash
# Full-stack acceptance smoke test (Phase 26). Chains everything that had
# only ever been verified manually, phase by phase, across this project's
# whole build: backend tests, frontend lint/build, the dev-mode Docker
# stack, and the TLS-terminated production-mode stack - each with a real
# request proving the thing actually works, not just that containers
# started. Run from the repo root: ./scripts/smoke-test.sh
set -euo pipefail
cd "$(dirname "$0")/.."

pass() { echo "  PASS: $1"; }
fail() { echo "  FAIL: $1"; exit 1; }

echo "== 1/5 Backend test suite =="
(cd backend && NODE_ENV=test REDIS_URL=redis://127.0.0.1:6379/1 UPLOAD_DIR=uploads-test \
  NODE_OPTIONS=--experimental-vm-modules npx jest --runInBand --forceExit) \
  || fail "backend test suite"
pass "backend test suite"

echo "== 2/5 Frontend lint + build =="
(cd frontend && npm run lint && npm run build) || fail "frontend lint/build"
pass "frontend lint/build"

echo "== 3/5 Dev-mode Docker stack (plain HTTP) =="
docker compose up --build -d
trap 'docker compose down > /dev/null 2>&1' EXIT
for i in $(seq 1 30); do
  curl -sf http://localhost:5001/api/health > /dev/null 2>&1 && break
  sleep 1
  [ "$i" -eq 30 ] && fail "backend never became healthy (dev mode)"
done
curl -sf http://localhost:5001/api/health > /dev/null || fail "GET /api/health (dev mode)"
curl -sf -o /dev/null http://localhost:5173/ || fail "frontend not reachable (dev mode)"
pass "dev-mode stack healthy, backend + frontend reachable"
docker compose down > /dev/null 2>&1
trap - EXIT

echo "== 4/5 Production-mode Docker stack (TLS proxy) =="
if [ ! -f proxy/certs/cert.pem ]; then
  ./proxy/generate-cert.sh
fi
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
trap 'docker compose -f docker-compose.yml -f docker-compose.prod.yml down > /dev/null 2>&1' EXIT
for i in $(seq 1 30); do
  curl -sfk https://localhost/api/health > /dev/null 2>&1 && break
  sleep 1
  [ "$i" -eq 30 ] && fail "backend never became healthy (prod mode)"
done
curl -sfk https://localhost/api/health > /dev/null || fail "GET /api/health over TLS"

# The one behavior Phase 24 deliberately deferred and Phase 25 closed:
# under real NODE_ENV=production + genuine HTTPS, the refresh cookie must
# actually carry Secure - prove it with a real register + refresh, not
# just a header inspection.
EMAIL="smoke-$(date +%s)@chatflow.test"
COOKIE_JAR=$(mktemp)
REGISTER_HEADERS=$(curl -sk -D - -o /dev/null -X POST https://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Smoke Test\",\"email\":\"$EMAIL\",\"password\":\"Password123!\"}" \
  -c "$COOKIE_JAR")
echo "$REGISTER_HEADERS" | grep -qi "Set-Cookie:.*Secure" || fail "refresh cookie missing Secure flag under production+HTTPS"
curl -sfk -X POST https://localhost/api/auth/refresh -b "$COOKIE_JAR" > /dev/null || fail "refresh cookie did not actually work"
rm -f "$COOKIE_JAR"
pass "prod-mode stack healthy, TLS + Secure cookie + refresh flow all genuinely work"
docker compose -f docker-compose.yml -f docker-compose.prod.yml down > /dev/null 2>&1
trap - EXIT

echo "== 5/5 OpenAPI spec reachable =="
docker compose up --build -d
trap 'docker compose down > /dev/null 2>&1' EXIT
for i in $(seq 1 30); do
  curl -sf http://localhost:5001/api-docs.json > /dev/null 2>&1 && break
  sleep 1
  [ "$i" -eq 30 ] && fail "api-docs never became reachable"
done
curl -sf http://localhost:5001/api-docs.json | grep -q '"openapi"' || fail "api-docs.json malformed"
pass "OpenAPI spec reachable and well-formed"
docker compose down > /dev/null 2>&1
trap - EXIT

echo
echo "All acceptance checks passed."
