import { randomUUID } from 'node:crypto';

const VALID_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Reuses an incoming `X-Request-ID` when it is safe to echo and to put in a URN; otherwise generates one. Never rejects. */
export function resolveRequestId(
  header: string | string[] | undefined,
): string {
  // Duplicate headers arrive joined with ", " (which fails the pattern) or, for odd headers, as an array.
  return typeof header === 'string' && VALID_ID.test(header)
    ? header
    : randomUUID();
}
