import { STATUS_CODES } from 'node:http';
import { BadRequestException, HttpException } from '@nestjs/common';
import { z } from 'zod';

// shortcut: placeholder domain (RFC 9457 does not require it to resolve), replace when the API has a real one.
export const PROBLEM_TYPE_BASE = 'https://api.example.dev/problems/';

export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(100).max(599),
  detail: z.string(),
  instance: z.string(),
  code: z.string(),
  errors: z
    .array(z.object({ pointer: z.string(), message: z.string() }))
    .optional(),
});

export type Problem = z.infer<typeof problemSchema>;
export type ValidationError = NonNullable<Problem['errors']>[number];

/** 400 raised by the validation pipe; carries the per-field `errors[]`. */
export class ValidationFailedException extends BadRequestException {
  constructor(readonly errors: ValidationError[]) {
    super('Request validation failed.');
  }
}

/** An HTTP error that carries its own problem `code` (e.g. 401 INVALID_CREDENTIALS). */
export class CodedHttpException extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
  ) {
    super(message, status);
  }
}

const escapeToken = (token: string) =>
  token.replaceAll('~', '~0').replaceAll('/', '~1');

/** RFC 6901 JSON Pointer; the root is the empty string. */
export function toPointer(path: readonly PathSegment[] | undefined): string {
  return (path ?? [])
    .map((s) => escapeToken(String(typeof s === 'object' ? s.key : s)))
    .map((t) => `/${t}`)
    .join('');
}

// The slice of a Standard Schema issue we read (zod adds `code` and `keys` to its issues).
type PathSegment = PropertyKey | { readonly key: PropertyKey };
interface Issue {
  readonly message: string;
  readonly path?: readonly PathSegment[] | undefined;
  readonly code?: string;
  readonly keys?: readonly string[];
}

/** Maps schema issues to `errors[]`; zod reports all unknown keys in one issue, so each key gets its own item. */
export function toValidationErrors(
  issues: readonly Issue[],
): ValidationError[] {
  return issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys' && issue.keys) {
      return issue.keys.map((key) => ({
        pointer: toPointer([...(issue.path ?? []), key]),
        message: `Unrecognized key: "${key}"`,
      }));
    }
    return [{ pointer: toPointer(issue.path), message: issue.message }];
  });
}

export function codeForStatus(status: number): string {
  if (status === 400) return 'VALIDATION_FAILED';
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 500) return 'INTERNAL';
  return `HTTP_${String(status)}`;
}

export function buildProblem(
  status: number,
  code: string,
  detail: string,
  requestId: string,
  errors?: ValidationError[],
): Problem {
  return {
    type: PROBLEM_TYPE_BASE + code.toLowerCase().replaceAll('_', '-'),
    title: STATUS_CODES[status] ?? 'Error',
    status,
    detail,
    instance: `urn:request:${requestId}`,
    code,
    ...(errors && { errors }),
  };
}

/** Decides status, code, detail and errors for any thrown value (diagram: filter-mapping). */
export function describeException(
  exception: unknown,
  jsonBodyUnparsed = false,
): {
  status: number;
  code: string;
  detail: string;
  errors?: ValidationError[];
} {
  if (exception instanceof ValidationFailedException) {
    return {
      status: 400,
      code: 'VALIDATION_FAILED',
      detail: exception.message,
      errors: exception.errors,
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    // Nest turns body-parser's SyntaxError into a plain BadRequestException with only the parser's text and no cause,
    // so "a 400 on a request whose JSON body never parsed" is the only signal that it was malformed JSON.
    if (status === 400 && jsonBodyUnparsed && !exception.cause) {
      return {
        status,
        code: 'VALIDATION_FAILED',
        detail: 'Request body is not valid JSON.',
      };
    }
    const code =
      exception instanceof CodedHttpException
        ? exception.code
        : codeForStatus(status);
    return { status, code, detail: exception.message };
  }
  return {
    status: 500,
    code: 'INTERNAL',
    detail: 'An unexpected error occurred.',
  };
}
