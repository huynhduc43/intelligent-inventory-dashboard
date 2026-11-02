import type { Request } from 'express';
import { type LoggerOptions, stdTimeFunctions } from 'pino';
import type { Options } from 'pino-http';
import type { AppConfig } from './config.js';
import { resolveRequestId } from './request-id.js';

const isHealthProbe = (req: Request) =>
  (req.method === 'GET' || req.method === 'HEAD') &&
  req.originalUrl.startsWith('/health/');

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
    customLogLevel: (req, res) => {
      if (res.statusCode >= 500) return 'error';
      return isHealthProbe(req as Request) ? 'silent' : 'info';
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
