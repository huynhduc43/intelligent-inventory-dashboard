# `pino-http` is mounted ahead of Nest's body parser; nestjs-pino reuses it

Nest registers its JSON body parser before any module middleware, so with nestjs-pino's default setup a malformed or oversized body fails before the logger runs: no request ID, no `X-Request-ID` and no log line, although the problem+json `instance` points at one (§5.1). We mount `pino-http` ourselves with `app.use()` in a `configureApp(app, config)` that `main.ts` and the integration tests share, and register `LoggerModule` with `useExisting: true`, which then only binds the existing `req.log` to its request context. Both read their options from one `pinoHttpOptions(config)`, so every request gets exactly one ID and one line.

## Considered Options

- Accept the gap, or add only an early request-ID middleware: parser errors keep an `instance` with no log line behind it.
- `bodyParser: false` and mount `express.json()` as module middleware after the logger: no gap either, but `express` becomes a direct dependency and the setup is unusual.
