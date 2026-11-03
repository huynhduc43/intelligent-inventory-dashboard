import { expect } from 'vitest';
import { PROBLEM_TYPE_BASE } from '../../../src/shared/problem.js';

/** Asserts an error response end to end: HTTP status, problem+json content type, and the body's status, type and code. */
export function expectProblem(
  res: { status: number; body: unknown; headers: Record<string, unknown> },
  status: number,
  code: string,
): void {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
  expect(res.body).toMatchObject({
    status,
    code,
    type: PROBLEM_TYPE_BASE + code.toLowerCase().replaceAll('_', '-'),
  });
}
