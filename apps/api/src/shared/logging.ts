import type { Request } from 'express';
import { type LoggerOptions, stdTimeFunctions } from 'pino';
import type { Options } from 'pino-http';
import type { AppConfig } from './config.js';
import { resolveRequestId } from './request-id.js';

// Decided from the matched route, so unknown paths under /health/ still get a log line.
const isHealthProbe = (req: Request) =>
  (req.method === 'GET' || req.method === 'HEAD') &&
  ((req.route as { path?: string } | undefined)?.path?.startsWith('/health/') ??
    false);

// nestjs-pino's catch-all middleware route; it is the "matched route" of requests no controller matched.
const CATCH_ALL = '{/*splat}';

// Matched Express route, else the path without the query (unknown routes, body-parser errors).
const routeOf = (req: Request) => {
  const path = (req.route as { path?: string } | undefined)?.path;
  return path && path !== CATCH_ALL ? path : req.originalUrl.split('?')[0];
};

const base = (req: Request, status: number, ms: number) => ({
  route: routeOf(req),
  method: req.method,
  status,
  duration_ms: ms,
});

/** One option set for the pino-http middleware that `configureApp` mounts and for the nestjs-pino root logger. */
export function pinoOptions(config: AppConfig): LoggerOptions {
  return {
    level: config.LOG_LEVEL,
    timestamp: stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: {
      paths: ['req.headers.authorization', '*.password'],
      censor: '[Redacted]',
    },
  };
}

export function pinoHttpOptions(config: AppConfig): Options {
  return {
    ...pinoOptions(config),
    customAttributeKeys: { reqId: 'req_id' },
    quietReqLogger: true,
    quietResLogger: true,
    genReqId: (req, res) => {
      const id = resolveRequestId(req.headers['x-request-id']);
      res.setHeader('X-Request-ID', id);
      return id;
    },
    // The auth guards set these request fields; absent (so omitted) on unauthenticated requests.
    customProps: (req) => {
      const { userId, dealershipId } = req as Request & {
        userId?: string;
        dealershipId?: string;
      };
      return { user_id: userId, dealership_id: dealershipId };
    },
    customLogLevel: (req, res) => {
      if (res.statusCode >= 500) return 'error';
      if (isHealthProbe(req as Request)) return 'silent';
      // Failed logins and throttled requests; the line carries no email or password.
      const r = req as Request;
      const failedLogin =
        r.method === 'POST' &&
        r.originalUrl.split('?')[0] === '/api/v1/auth/login' &&
        (res.statusCode === 401 || res.statusCode === 429);
      return failedLogin ? 'warn' : 'info';
    },
    customSuccessObject: (req, res, val: { responseTime: number }) =>
      base(req as Request, res.statusCode, val.responseTime),
    customErrorObject: (
      req,
      res,
      _err,
      val: { responseTime: number; err: unknown },
    ) => ({
      ...base(req as Request, res.statusCode, val.responseTime),
      err: val.err,
    }),
  };
}
