# ChatFlow — Final Acceptance Record

Phase 26 of the build. This is the evidence record for "is this actually
done," not a feature list restated from the README — every line below
was verified live at least once (manual testing, a real browser, real
containers, or a real spawned process), not assumed from reading the code.

## How to reproduce this yourself

```bash
./scripts/smoke-test.sh
```

Chains everything below into one script: backend test suite, frontend
lint/build, the dev-mode Docker stack (with a real health check), the
TLS-terminated production-mode stack (with a real register + refresh
proving the `Secure` cookie actually works, not just that the header
looks right), and OpenAPI spec reachability. Exits non-zero on the first
failure. Last run: **all 5 stages passed.**

## Automated test coverage

**26 test suites, 182 tests, 0 failures** (`cd backend && npm test`).

No skipped tests, no TODO/FIXME comments anywhere in `backend/src` or
`frontend/src`, no dead/orphaned exports. Frontend: `npm run lint` (3
warnings, all reviewed and deliberately left - see below) and
`npm run build` both clean.

### A note on `--forceExit`

The backend test script uses `--forceExit`. Investigated during this
phase (running with `--detectOpenHandles` instead, then bisecting which
of the 26 files was responsible) to confirm this isn't masking an
unknown leak. Found and confirmed: `tests/redisRateLimiting.test.js`
alone causes Jest to hang on exit under `--experimental-vm-modules`, but
the identical logic extracted into a standalone script (no Jest) exits
cleanly - a documented Jest/ioredis/ESM test-environment interaction,
not an application bug (see the comment in that file). Confirmed
separately and more importantly: the **application's own** shutdown path
(`server.js`) exits cleanly on a real `SIGTERM`, in under a second, with
zero reliance on `--forceExit` - proven by spawning a real server
process and signaling it (`tests/gracefulShutdown.test.js`), including
with an active WebSocket connection open at the moment of the signal.

## Feature checklist (by phase, condensed)

| Area | Verified |
|---|---|
| Auth (register/login/refresh/logout) | JWT access + rotating refresh tokens, httpOnly cookie, bcrypt hashing - live and automated |
| Users (profile, search, block/unblock) | Live two-user testing; block/unblock tested from both directions |
| Conversations & messages | Private + group, idempotent send (`clientMessageId`), edit/delete, soft delete |
| Real-time (Socket.IO) | Typing indicators, presence/last-seen, read receipts - live two-user testing, both directions |
| Group chat | Create, rename, add/remove members, promote admin, leave - live three-user testing |
| File/image/voice messages | Upload validation (real byte-sniffing, not trusted MIME), size limits, voice duration |
| Redis integration | Rate limiting (cross-instance, tested), profile caching, presence - all fail open, tested live and via `--detectOpenHandles`-informed review |
| Multi-instance delivery | Redis Socket.IO adapter, tested with two real server processes on different ports |
| Security hardening | NoSQL injection defense, mass-assignment protection, generic prod error messages, sensitive data never logged |
| Swagger/OpenAPI docs | 26 documented paths, spec validity now covered by an automated test (`tests/swagger.test.js`) - previously untested |
| Frontend (React) | Full parity with backend: auth, chat, groups, uploads, profile, block/unblock, connection-loss UI |
| Developer dashboard | Live Mongo/Redis health, process stats, aggregate counts - polls every 5s |
| Failure simulation | On-demand Redis disconnect/reconnect against the app's real client (not a mock), gated to non-production |
| Docker (dev mode) | Full stack in containers, data persists across `down`+`up`, verified with a real registered user |
| Docker (production mode) | TLS-terminating nginx proxy, `NODE_ENV=production` + `Secure` cookie proven to actually work over real HTTPS - the exact gap Phase 24 deferred and Phase 25 closed |
| Graceful shutdown | `SIGTERM`+`SIGINT`, ordered cleanup (Socket.IO → HTTP → Redis → Mongo), 10s force-exit safety net |

## Deliberate, disclosed limitations (not oversights)

Worth being able to explain in an interview - each was a conscious
scope decision, not something missed:

- **No admin role.** The dashboard and Redis failure-simulation
  endpoints are gated by "authenticated" + "not production," not a real
  RBAC system. A real deployment would add an admin role; building one
  for a single internal tool wasn't worth the complexity here.
- **Self-signed TLS cert for local production-mode testing.** Real
  production would use a real CA (Let's Encrypt, etc.) - the cert here
  exists only to make `NODE_ENV=production`'s behavior testable at all
  without a real domain.
- **Single-origin CORS.** `CLIENT_URL` supports one origin string, not a
  list. Fine for this app's one-frontend deployment shape; would need
  revisiting for multi-origin (e.g. staging + prod simultaneously).
- **No structured/JSON logging.** Winston's level changes between dev
  and production (`debug` vs `info`), but the format doesn't - no log
  aggregation service integration was in scope.
- **Two `AuthContext`/`SocketContext` lint warnings, left as-is.** Both
  export a Provider component and a custom hook from the same file -
  idiomatic, standard React Context pattern. Splitting them into
  separate files would only serve a Fast Refresh optimization at the
  cost of code cohesion, for files this small.

## What changed in Phase 26 specifically

- Added `tests/swagger.test.js` - the OpenAPI spec had never actually
  been tested (just written); now its validity and the endpoints serving
  it (`/api-docs`, `/api-docs.json`) are covered.
- Investigated `--detectOpenHandles` (previously never run without
  `--forceExit`), found and explained the one file responsible, and
  proved separately that the real application shutdown path doesn't
  depend on it.
- Removed `backend/src/jobs/` - an empty Phase 1 scaffold directory for
  background jobs that were never needed anywhere in the project.
- Fixed a real (if minor) staleness risk in `GroupInfoPanel.jsx`:
  wrapped `load` in `useCallback` so the effect's dependency array is
  accurate, instead of suppressing the lint warning.
- Wrote `scripts/smoke-test.sh` - the first time backend tests, frontend
  build, and both Docker topologies have been chained into one
  repeatable, scripted acceptance check instead of only ever being
  verified manually, phase by phase, across this whole build.
