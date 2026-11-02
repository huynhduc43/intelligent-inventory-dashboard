import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { buildProblem, describeException } from './problem.js';

/** pino-http logs `res.err` on the completion line; without it a 5xx carries a made-up error. */
export function setResponseError(res: Response, exception: unknown) {
  (res as Response & { err?: Error }).err =
    exception instanceof Error ? exception : new Error(String(exception));
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const { status, code, detail, errors } = describeException(
      exception,
      req.body === undefined && req.is('json') === 'json',
    );
    if (status >= 500) setResponseError(res, exception);
    if (res.headersSent) {
      res.end();
      return;
    }
    // RFC 9110 §15.5.2: every 401 carries a challenge.
    if (status === 401) res.setHeader('WWW-Authenticate', 'Bearer');
    res
      .status(status)
      .type('application/problem+json')
      .send(buildProblem(status, code, detail, req.id as string, errors));
  }
}

/** Health bodies keep Terminus's shape (ADR 0003): write the exception's own response unchanged. */
@Catch(HttpException)
export class HealthPassthroughFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    if (status >= 500) setResponseError(res, exception);
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(status).json(exception.getResponse());
  }
}
