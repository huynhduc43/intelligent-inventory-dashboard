# Login, JWT and throttling building blocks (research for #8)

Research for issue #8 (§4.1, §4.6, §4.7, §4.14, D13–D17). The choices in the architecture doc (argon2id via `crypto.argon2`, `@nestjs/jwt` HS256 with an allowlist, `@nestjs/throttler` 10/min per IP, dummy hash, one 401 `INVALID_CREDENTIALS`) are taken as given; this note only checks how the pieces behave. Six findings shape the design. (1) `crypto.argon2` exists since Node 24.7.0, has a callback form and a sync form, returns a raw `Buffer` and prints **no** ExperimentalWarning (stability 1.2, release candidate). A promise form comes from `util.promisify`. One hash at m=19456, t=2, p=1 takes about 28 ms. The PHC string has to be built and parsed by hand. (2) `@nestjs/jwt@12.0.3` supports Nest 12, is ESM, and wraps `jsonwebtoken@9.0.3`. Without `algorithms`, a secret key verifies HS256/384/512 only, and `alg: none` is always rejected for a secret key; the allowlist still belongs in the config. (3) `jsonwebtoken` takes the clock from `Date.now()` unless a test passes `clockTimestamp` (verify) or `iat` in the payload (sign), so an expired-token test needs no fake timers. (4) `@nestjs/throttler@6.7.1` supports Nest 12, is CommonJS (named imports from ESM work), `ttl` is in **milliseconds**, and the counter key includes controller class and handler name, so a guard on one route limits only that route. (5) The throttler tracks `req.ip`, which behind a reverse proxy is the proxy's address unless Express `trust proxy` is set; the repo sets nothing. (6) The problem+json filter maps only 400, 404 and 500 to named codes; 401, 403 and 429 currently become `HTTP_401`, `HTTP_403`, `HTTP_429`, so §4.7's `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `FORBIDDEN` and `RATE_LIMITED` need a change in `problem.ts`.

Method: claims were checked against the Node v24.15.0 docs source (`doc/api/crypto.md`), the published tarballs of `@nestjs/jwt@12.0.3`, `@nestjs/throttler@6.7.1` and `jsonwebtoken@9.0.3` (`npm pack`), the repo files named in §4, and a throwaway Nest 12.3.2 + Express 5 probe under Node 24.15.0 kept outside the repo (scratchpad). Line numbers refer to the published package files of the version named.

## 1. Node 24 `crypto.argon2`

- **Since / stability.** `added: v24.7.0`, `Stability: 1.2 - Release candidate` (Node v24.15.0 `doc/api/crypto.md:3292-3300`). Not experimental. The probe (v24.15.0, stderr captured) printed no warning. `.nvmrc` pins 24, so it is available.
- **Signature.** `crypto.argon2(algorithm, parameters, callback)` and `crypto.argon2Sync(algorithm, parameters)` (`crypto.md:3292, 3378`). `algorithm` is `'argon2d' | 'argon2i' | 'argon2id'`. Required `parameters`:

  | Name          | Meaning                                                                          |
  | ------------- | -------------------------------------------------------------------------------- |
  | `message`     | the password (string, ArrayBuffer, Buffer, TypedArray, DataView)                 |
  | `nonce`       | the salt, **at least 8 bytes**; 16 random bytes recommended (`crypto.md:3328`)    |
  | `parallelism` | lanes (`p`)                                                                      |
  | `tagLength`   | output length in bytes                                                           |
  | `memory`      | memory cost in **KiB** blocks (`m`); 19 MiB is `19456`                           |
  | `passes`      | iterations (`t`)                                                                 |
  | `secret`      | optional pepper, not stored with the hash                                        |
  | `associatedData` | optional extra data                                                           |

  The docs say `parallelism` "must be greater than 1", but the probe ran `parallelism: 1` fine; treat that sentence as a doc slip. The probe also showed `ERR_OUT_OF_RANGE` for `memory < 8` and for a nonce under 8 bytes.
- **Callback vs promise.** The callback is `(err, derivedKey: Buffer)`. There is no native promise form, but `util.promisify(crypto.argon2)` works (the probe returned a `Buffer`). Argon2 runs on the libuv thread pool in the async form, so it does not block the event loop; `argon2Sync` does. Use the async form in the request path.
- **Output.** A raw `Buffer` of `tagLength` bytes, not a PHC string. The probe: 32 bytes.
- **Timing.** One hash at `{memory: 19456, passes: 2, parallelism: 1, tagLength: 32}`: 28–29 ms sync, 27–28 ms promisified (Node 24.15.0, macOS). A unit test that hashes a handful of passwords is cheap.
- **PHC string.** Format `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`, where `salt` and `hash` are standard base64 **without padding** ([PHC string format spec](https://github.com/P-H-C/phc-string-format/blob/master/phc-sf-spec.md), "Parameters and encoding"). The probe produced `$argon2id$v=19$m=19456,t=2,p=1$2H5BTF05KCYFHf4eNjo5HQ$GfSJi+Co6ssonp2/uyCzFjQ1zKcD7X9vRT3S93fJ3pY` with `buf.toString('base64').replace(/=+$/, '')`. Node's `Buffer.from(s, 'base64')` accepts unpadded input, so parsing is `split('$')` into `['', 'argon2id', 'v=19', 'm=…,t=…,p=…', salt, hash]`. Verification reads `m`, `t`, `p` and the hash length **from the stored string**, recomputes with those, and compares with `timingSafeEqual` (which throws on unequal lengths, so check lengths first). Reading the parameters from the string is what lets the cost be raised later without breaking old hashes.
- **Seed script.** `db/seed.ts` runs under Node type stripping and imports packages only (see §4). It cannot import the app's `hashPassword`, so it needs its own copy of the ten lines or the helper must be a plain `.ts` with no local imports that both can use. This is Q4.

## 2. `@nestjs/jwt`

- **Version / shape.** `@nestjs/jwt@12.0.3` (npm, 2026-11-02). `"type": "module"`, `exports` has `import` and `default` pointing at `./dist/index.js`. Peer: `@nestjs/common ^8 … ^12`. Depends on `jsonwebtoken 9.0.3` and `@types/jsonwebtoken 9.0.10`. No new peer needed beyond what the repo has.
- **API.** `JwtModule.register({ secret, signOptions, verifyOptions, global })` or `registerAsync({ useFactory, inject })`. `JwtService.signAsync(payload, options?)` and `verifyAsync(token, options?)` merge per-call options over the module's `signOptions` / `verifyOptions` (`dist/jwt.service.js:40-79, 83-94`). Both return promises and reject with the underlying `jsonwebtoken` error.
- **Options.** Sign: `algorithm` (default `HS256`, `jsonwebtoken sign.js:98`), `issuer`, `audience`, `expiresIn` (number of seconds, or a string such as `'1h'`), `subject`. Verify: `algorithms`, `issuer`, `audience`, `clockTimestamp`, `clockTolerance`, `ignoreExpiration`. `JWT_TTL_S` is an integer of seconds, so `expiresIn: config.JWT_TTL_S` needs no unit parsing.
- **Verify defaults.** For a symmetric (secret) key and no `algorithms`, `jsonwebtoken` sets `algorithms = ['HS256','HS384','HS512']` (`verify.js:14, 132-134`). A token whose header `alg` is not in the list fails with `invalid algorithm` (`verify.js:144-146`). A token with an empty signature and a secret present fails with `jwt signature is required` (`verify.js:108-110`), so `alg: none` cannot pass unless the caller puts `"none"` in `algorithms`. The probe confirmed both (HS512 token: `invalid algorithm`; `none` token: `jwt signature is required`). Setting `algorithms: ['HS256']` still narrows it from three HMAC variants to one, as RFC 8725 asks.
- **Issuer and audience.** With `issuer` / `audience` set on verify, a token with a different or missing value fails with `JsonWebTokenError('jwt issuer invalid…')` / `('jwt audience invalid…')` (`verify.js:194-217`).
- **Errors** (all from `jsonwebtoken`; the probe printed each):

  | Case                         | Class                | Message                             |
  | ---------------------------- | -------------------- | ----------------------------------- |
  | expired                      | `TokenExpiredError`  | `jwt expired` (has `expiredAt`)     |
  | not yet valid (`nbf`)        | `NotBeforeError`     | `jwt not active`                    |
  | bad signature                | `JsonWebTokenError`  | `invalid signature`                 |
  | wrong `alg`, including HS512 | `JsonWebTokenError`  | `invalid algorithm`                 |
  | `alg: none`                  | `JsonWebTokenError`  | `jwt signature is required`         |
  | wrong `iss` / `aud`          | `JsonWebTokenError`  | `jwt issuer invalid. expected: …`   |
  | garbage                      | `JsonWebTokenError`  | `jwt malformed`                     |

  `TokenExpiredError` and `NotBeforeError` extend `JsonWebTokenError` (`jsonwebtoken index.js:6-7`; both are `instanceof JsonWebTokenError`). The guard can catch any of them and return one `401 UNAUTHENTICATED`; it does not need to tell the client which one. Do not forward `err.message` into the problem `detail`.
- **Pinning time.** Verify reads `options.clockTimestamp || Math.floor(Date.now()/1000)` (`verify.js:57`) and compares `clockTimestamp >= payload.exp` (`verify.js:189`). Sign uses `payload.iat || Math.floor(Date.now()/1000)` and computes `exp = iat + expiresIn` (`sign.js:185, 205-207`). So the service can sign with `iat: Math.floor(clock.now().getTime()/1000)`, and the guard can verify with `clockTimestamp` from the same `Clock`. Probe: a token signed with `iat = now - 1000` and `expiresIn: 900` failed with `TokenExpiredError`; passing `clockTimestamp: iat + 10` accepted it; `clockTimestamp: now + 901` rejected a fresh token. `clockTimestamp` of `0` is falsy and falls back to `Date.now()`, which no realistic test hits.

## 3. `@nestjs/throttler`

- **Version / shape.** `@nestjs/throttler@6.7.1` (npm, 2026-11-02). Peers: `@nestjs/common` and `@nestjs/core` `^7 … ^12`, `reflect-metadata`. CommonJS with `main: dist/index.js`. The probe imported `{ ThrottlerModule, ThrottlerGuard, ThrottlerStorageService }` from an ES module without trouble (Node's CJS lexer finds the named exports).
- **Configuration.** `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }])` (array form) or `{ throttlers: [...], storage, getTracker, errorMessage, … }` (`throttler-module-options.interface.d.ts`). `ttl` is in **milliseconds** (README example `ttl: 60000`; the storage uses it as `Date.now() + ttl`, `throttler.service.js:115-120`). `forRootAsync({ useFactory, inject })` exists for reading `APP_CONFIG`.
- **Scope: one route.** `ThrottlerGuard` is a normal guard. Applying `@UseGuards(ThrottlerGuard)` to the login handler only limits that handler; the probe limited `POST /t/login` to 3 and left `POST /t/other` unlimited and header-free. The key is `sha256(<ControllerClass>-<handler>-<throttlerName>-<tracker>)` (`throttler.guard.js:165-168`), so two routes do not share a counter. The alternative, a global `APP_GUARD` plus `@SkipThrottle()` on everything else, makes every future route opt out, which is the wrong default for one limited route. `@Throttle({ default: { limit, ttl } })` overrides per route if the module default should be broader.
- **Tracker.** `getTracker(req)` returns `normalizeIp(req.ip, ipv6SubnetPrefix)` (`throttler.guard.js:150-152`); IPv6 addresses are masked to a /64 by default (`ip.js`), so one host cannot rotate through its /64. `req.ip` is Express's: the socket address unless `app.set('trust proxy', …)` is configured, in which case it comes from `X-Forwarded-For`. The repo sets no `trust proxy` (`main.ts`, `configure-app.ts`; grep finds none), so behind a proxy or load balancer every client would share one counter. That is fine for the assessment's `docker compose up` (no proxy); the trigger to change it is the first deployment behind a proxy. Setting it blindly would let clients spoof `X-Forwarded-For` and dodge the limit.
- **Exception and headers.** Over the limit: `ThrottlerException` (an `HttpException`, status 429, message `ThrottlerException: Too Many Requests`, `throttler.exception.js`), configurable with `errorMessage`. Headers: under the limit `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (seconds); at 429 `Retry-After` (seconds) and no `X-RateLimit-*` (`throttler.guard.js:128-147`). The probe saw exactly that. `setHeaders: false` turns them off. The exception is thrown inside a guard, so the global filter handles it; the filter writes `res.status().type().send()` and does not clear headers (`problem-details.filter.ts:30-37`), so `Retry-After` should survive. Confirm with the integration test.
- **Block duration.** `blockDuration` defaults to `ttl` (`throttler.guard.js:93`): once the limit is exceeded the IP stays blocked for a further full `ttl`, and further requests while blocked do not extend it (the probe's 4th and 5th calls both returned `Retry-After: 2` for `ttl: 2000`). So "10/min" is "10 requests, then blocked for 60 s".
- **Storage.** Default `ThrottlerStorageService`, in memory, per process (`throttler.service.js`); the provider token is the symbol `ThrottlerStorage`, not the class (`throttler.providers.js`). It sweeps idle records every 60 s with an `unref`'d timer and clears it on `onApplicationShutdown`. Two API replicas would each allow 10 per minute, which is the stated shortcut (§4.1 notes the in-memory throttler). Mark it with a `shortcut:` comment.
- **Tests.** Storage is created per module instance, so each `Test.createTestingModule(...)` / `app` starts with empty counters: no leakage if each spec file (or `beforeEach`) builds its own app. To reset inside one app: `app.get(ThrottlerStorage).storage.clear()` plus `hitExpirations.clear()` (probe: login returned 201 again). A test that wants to hit the limit simply sends 11 requests; a test that must not hit it can build the app with a larger `limit` (the throttler options come from `AppModule.forRoot`) or reuse the one app but rotate across tests only a few logins. Do not use `getTracker` overrides in tests; the supertest requests all come from `::ffff:127.0.0.1`, which is exactly the shared bucket a limit test wants.

## 4. Existing repo code

- **Status to code.** `codeForStatus` (`apps/api/src/shared/problem.ts:64-70`) maps 400 → `VALIDATION_FAILED`, 404 → `NOT_FOUND`, 500 → `INTERNAL`, any other status → `HTTP_<status>`. `describeException` (`problem.ts:90-130`) returns `{ status, code, detail }` for `ValidationFailedException` (400), any `HttpException` (status from the exception, code from `codeForStatus`, detail from `exception.message`, plus the malformed-JSON special case), and 500 otherwise. ADR 0007 says the `type` is the base plus the kebab-cased code and `HTTP_<status>` is for statuses §4.8 does not name. §4.8 names `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `FORBIDDEN`, `RATE_LIMITED` (`docs/research/backend-architecture.md:404`), so today a plain `UnauthorizedException` would produce `HTTP_401`.
- **How a module raises a specific code.** There is one precedent: `ValidationFailedException` is a subclass the filter recognises by `instanceof` (`problem.ts:23-27, 96-103`). There is no general mechanism. Two ways to add one are in Q1.
- **Filter.** `ProblemDetailsFilter` (`problem-details.filter.ts:17-38`) is registered as `APP_FILTER` in `SharedModule` (`shared.module.ts:36`). It sets `res.err` for 5xx only (line 29), ends the response if headers were sent, and otherwise writes `application/problem+json` with `instance: urn:request:<req.id>` (`problem.ts:67`). 4xx therefore log as ordinary completion lines with no stack, which suits failed logins (the architecture doc wants `warn` on failed logins; the request line is `info` today, so the login service needs its own `warn` log with no email or password in it).
- **Validation (ADR 0005).** `SharedModule` registers `StandardSchemaValidationPipe` as `APP_PIPE`, with an `exceptionFactory` that throws `ValidationFailedException(toValidationErrors(issues))` (`shared.module.ts:34-43`). A route opts in with `@Body({ schema })` and a `z.strictObject`; the pipe is a no-op without a schema (`integration/problem-json.spec.ts:36-47` is the working example). Login would use `z.strictObject({ email: z.string()…, password: z.string()… })`. D14's 15–128 rule belongs on **creation**, not on login: applying it on login would answer 400 to a short wrong password and tell an attacker the length rule. Login should only bound the length (for example `max(128)`, to cap argon2 input) and return 401 for anything else wrong.
- **Schema (`apps/api/src/shared/schema.ts`).**
  - `dealership(id uuid pk default random, name text, timezone text, watch_days smallint default 60, aging_days smallint default 90)` with CHECK `1 <= watch < aging <= 3650` (lines 21-37).
  - `app_user(id uuid pk, email text not null, display_name text not null, password_hash text not null, status text 'ACTIVE'|'DISABLED' default 'ACTIVE')`, a unique index `app_user_email_lower_uq` on `lower(email)` and CHECK `app_user_status_chk` (lines 39-56). The unique index is on the expression, so lookups must be `WHERE lower(email) = lower($1)` to use it, and the seed may store any case.
  - `user_dealership(user_id → app_user, dealership_id → dealership, role text 'ADMIN'|'MANAGER'|'VIEWER')`, composite primary key `user_dealership_pkey (user_id, dealership_id)`, CHECK `user_dealership_role_chk` (lines 58-78).
- **Config.** `JWT_SECRET` (min 32 chars) and `JWT_TTL_S` (1–86 400, default 3600) already exist (`shared/config.ts:29-32`); there is no `JWT_ISSUER` / `JWT_AUDIENCE`, so `iss` and `aud` are constants unless Q3 says otherwise. The integration `testConfig` already passes a 35-character `JWT_SECRET` (`test/integration/support/postgres.ts:30-32`).
- **Integration test app.** `startMigratedPostgres()` starts `postgres:17.11-alpine` with the committed migrations and `testConfig(url, overrides)` builds a validated config with `LOG_LEVEL: silent` (`support/postgres.ts`). Specs build the app with `Test.createTestingModule({ imports: [AppModule.forRoot(config, logDestination)], controllers: [...] }).compile()`, `app.createNestApplication()`, `configureApp(app, config, logDestination)`, `await app.init()` and `supertest` (`problem-json.spec.ts:1-60`). `configureApp` mounts `pino-http` before the body parser and calls `useLogger` (`configure-app.ts:9-17`); `main.ts` uses the same function. Any new `trust proxy` setting would go in `configureApp` so tests and `main.ts` agree.
- **Migration script pattern.** `apps/api/db/migrate.ts` is run as `node --env-file-if-exists=.env db/migrate.ts` (`package.json` script `db:migrate`); Node 24's type stripping runs `.ts` directly, so the file may only import packages (no local `.ts`, no enums, no parameter properties, no decorators). It reads `process.env.DATABASE_URL`, exits 1 with a stderr line if missing, uses `drizzle(url)` and ends the pool (`migrate.ts:1-19`). A `db/seed.ts` and `"db:seed": "node --env-file-if-exists=.env db/seed.ts"` follow the same pattern. It cannot import `src/shared/schema.ts` (local `.ts`, and the `.js`-suffixed imports would not resolve under type stripping), so it uses raw SQL via `db.$client.query` / `sql` templates for the inserts, or ADR-recorded duplication of the table definitions. This is Q4.
- **Clock (ADR 0002).** `Clock` is an abstract class with `now(): Date` provided as `SystemClock` in `SharedModule` (`shared/clock.ts`; `shared.module.ts:27`). ADR 0002 exists for `updated_at`, but the rule in `CLAUDE.md` is general: "`now` comes from the injected `Clock`". `jsonwebtoken` does not read the `Clock`; unless the service passes `iat` and the guard passes `clockTimestamp`, it uses `Date.now()` and a test cannot pin time. Q2.
- **Process.** No `auth` module exists yet (`src/modules` has `health` and `inventory/domain` only). Adding `@nestjs/jwt` and `@nestjs/throttler` is a dependency addition and needs the user's approval before install.

## Decisions

**Q1. How does a module raise `INVALID_CREDENTIALS`, `UNAUTHENTICATED`, `FORBIDDEN`, `RATE_LIMITED`?**

- A. Extend `codeForStatus`: 401 → `UNAUTHENTICATED`, 403 → `FORBIDDEN`, 429 → `RATE_LIMITED`; add a small `ProblemException`-style subclass (like `ValidationFailedException`) carrying a `code`, thrown as `new InvalidCredentialsException()` (401, `INVALID_CREDENTIALS`).
- B. Only the status map; use a generic 401 for login too (no `INVALID_CREDENTIALS`), contradicting §4.7.
- C. Put the code in the `HttpException` response object (`new UnauthorizedException({ code: 'INVALID_CREDENTIALS' })`) and have the filter read it.

Recommendation: A. It follows the existing `ValidationFailedException` precedent, keeps the filter the only place that builds problems, and the three default codes make `ThrottlerException` and the guards need no changes.

**Q2. Should JWT `iat`/`exp` and the expiry check use the `Clock`?**

- A. Yes: sign with `iat` from `clock.now()` and verify with `clockTimestamp` from `clock.now()`, so a test pins time with a fixed `Clock`.
- B. No: let `jsonwebtoken` use `Date.now()`; test expiry with `JWT_TTL_S=1` and a sleep, or a token signed with a past `iat`.

Recommendation: A. It is two small arguments, matches the "inject `Clock`" rule, and gives a deterministic expired-token test with no sleep.

**Q3. `iss` and `aud` values: constants or config?**

- A. Constants in `auth` (`iss: 'inventory-api'`, `aud: 'inventory-dashboard'`).
- B. New env vars `JWT_ISSUER` and `JWT_AUDIENCE`.

Recommendation: A. A single deployment has one issuer and audience; env vars add two things that can be misconfigured. Move them to config when a second consumer exists.

**Q4. Where does the seed get password hashing and table access?**

- A. `db/seed.ts` is self-contained (type stripping, packages only): it inlines the ~10-line argon2 hash and writes the rows with raw SQL through the `pg` client, with a unit test that a hash it produces passes the app's `verifyPassword`.
- B. Put `hashPassword` in a dependency-free `.ts` file that both the app and the seed import (a relative import with a `.ts` suffix works under type stripping but not with the repo's `.js` import convention).
- C. Run the seed through `tsx` or the Nest build (adds a dependency or a build step).

Recommendation: A, with the unit test as the guard against drift. B conflicts with the `.js` import rule and C needs a new dependency.

**Q5. Rate limit wiring.**

- A. `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }])` in the `auth` module and `@UseGuards(ThrottlerGuard)` on the login handler only.
- B. Global `APP_GUARD` with `@SkipThrottle()` elsewhere.

Recommendation: A. The limit applies to one route; a global guard would make every later route opt out. Add a `shortcut:` comment (in-memory, per process) and no `trust proxy` setting until a proxy exists (note it in the docs as the trigger).

**Q6. How do tests reset the limiter?**

- A. Each throttling spec builds its own app (fresh in-memory storage); other specs set a high `limit` through the module options or never log in more than a few times per app.
- B. Clear `ThrottlerStorage` in `beforeEach` via `app.get(ThrottlerStorage)`.

Recommendation: A, with B only if a spec shares an app. Keeping the 10/min limit in non-throttling tests would make them order-dependent.

**Q7. Login input validation.**

- A. `z.strictObject({ email: z.string().min(1).max(254), password: z.string().min(1).max(128) })`; no 15-character rule on login.
- B. Apply D14 (15–128) on login too.

Recommendation: A. A 400 for a short password on login would reveal the policy and differ from the single 401 for wrong credentials.

**Q8. Compare path and dummy hash.**

- A. Parse the stored PHC string, recompute with its own `m`, `t`, `p` and tag length via the async `crypto.argon2`, compare with `timingSafeEqual` after a length check; for an unknown or disabled user, verify against a dummy hash created once at startup with the same parameters.
- B. Hard-code the parameters at verify time and ignore the stored ones.

Recommendation: A. It keeps old hashes valid when parameters change, and the dummy hash costs the same ~28 ms as a real check.
