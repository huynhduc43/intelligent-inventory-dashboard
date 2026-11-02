import {
  BadRequestException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  buildProblem,
  CodedHttpException,
  codeForStatus,
  describeException,
  problemSchema,
  toPointer,
  toValidationErrors,
  ValidationFailedException,
} from '../../../src/shared/problem.js';

const errorsOf = (schema: z.ZodType, input: unknown) => {
  const result = schema['~standard'].validate(input) as {
    issues?: Parameters<typeof toValidationErrors>[0];
  };
  return toValidationErrors(result.issues ?? []);
};

describe('toPointer', () => {
  it.each([
    [[], ''],
    [['limit'], '/limit'],
    [['address', 'city'], '/address/city'],
    [['items', 0, 'vin'], '/items/0/vin'],
    [['a/b'], '/a~1b'],
    [['m~n'], '/m~0n'],
    [['~/'], '/~0~1'],
    [[{ key: 'x' }], '/x'],
    [undefined, ''],
  ])('%j -> %j', (path, expected) => {
    expect(toPointer(path)).toBe(expected);
  });
});

describe('toValidationErrors', () => {
  const schema = z.strictObject({
    status: z.enum(['IN_STOCK', 'RESERVED']),
    items: z.array(z.strictObject({ vin: z.string() })),
  });

  it('points at nested and array fields in zod order', () => {
    const errors = errorsOf(schema, { status: 'X', items: [{ vin: 1 }] });
    expect(errors.map((e) => e.pointer)).toEqual(['/status', '/items/0/vin']);
  });

  it('gives each unknown key its own item', () => {
    const errors = errorsOf(schema, {
      status: 'IN_STOCK',
      items: [],
      a: 1,
      b: 2,
    });
    expect(errors).toEqual([
      { pointer: '/a', message: 'Unrecognized key: "a"' },
      { pointer: '/b', message: 'Unrecognized key: "b"' },
    ]);
  });

  it('points an unknown key under its parent', () => {
    const errors = errorsOf(schema, {
      status: 'IN_STOCK',
      items: [{ vin: 'x', z: 1 }],
    });
    expect(errors).toEqual([
      { pointer: '/items/0/z', message: 'Unrecognized key: "z"' },
    ]);
  });
});

describe('buildProblem', () => {
  it('derives type, title and instance', () => {
    expect(buildProblem(413, 'HTTP_413', 'too big', 'abc')).toEqual({
      type: 'https://api.example.dev/problems/http-413',
      title: 'Payload Too Large',
      status: 413,
      detail: 'too big',
      instance: 'urn:request:abc',
      code: 'HTTP_413',
    });
  });

  it('omits errors unless given', () => {
    const p = buildProblem(400, 'VALIDATION_FAILED', 'x', 'i', [
      { pointer: '/a', message: 'm' },
    ]);
    expect(p.errors).toHaveLength(1);
  });

  it('falls back to a generic title for an unknown status', () => {
    expect(buildProblem(599, 'HTTP_599', 'x', 'i').title).toBe('Error');
  });
});

describe('describeException', () => {
  it('maps a pipe failure with errors', () => {
    const e = new ValidationFailedException([{ pointer: '/a', message: 'm' }]);
    expect(describeException(e)).toEqual({
      status: 400,
      code: 'VALIDATION_FAILED',
      detail: 'Request validation failed.',
      errors: [{ pointer: '/a', message: 'm' }],
    });
  });

  it('maps HttpExceptions by status', () => {
    expect(describeException(new NotFoundException('nope'))).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      detail: 'nope',
    });
    expect(describeException(new BadRequestException('bad'))).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
    });
    expect(
      describeException(new ServiceUnavailableException('down')),
    ).toMatchObject({ status: 503, code: 'HTTP_503', detail: 'down' });
  });

  it('maps an unparsed JSON body to the fixed malformed-JSON problem', () => {
    expect(
      describeException(new BadRequestException('Unexpected token'), true),
    ).toEqual({
      status: 400,
      code: 'VALIDATION_FAILED',
      detail: 'Request body is not valid JSON.',
    });
  });

  it('keeps the message of other 400s, with or without a cause', () => {
    expect(
      describeException(new BadRequestException('Unexpected token'), false),
    ).toMatchObject({ detail: 'Unexpected token' });
    const aborted = new HttpException('request aborted', 400, {
      cause: new Error('x'),
    });
    expect(describeException(aborted, true)).toMatchObject({
      detail: 'request aborted',
    });
  });

  it('maps a body-parser 413 by status', () => {
    expect(
      describeException(new HttpException('request entity too large', 413)),
    ).toEqual({
      status: 413,
      code: 'HTTP_413',
      detail: 'request entity too large',
    });
  });

  it('hides everything else behind a fixed 500', () => {
    expect(describeException(new Error('pg: refused'))).toEqual({
      status: 500,
      code: 'INTERNAL',
      detail: 'An unexpected error occurred.',
    });
    expect(describeException('string')).toMatchObject({ status: 500 });
  });
});

describe('auth problem codes', () => {
  it.each([
    [401, 'UNAUTHENTICATED'],
    [403, 'FORBIDDEN'],
    [429, 'RATE_LIMITED'],
  ])('maps %i to %s', (status, code) => {
    expect(codeForStatus(status)).toBe(code);
  });

  it('uses the code a CodedHttpException carries', () => {
    expect(
      describeException(
        new CodedHttpException(401, 'INVALID_CREDENTIALS', 'x'),
      ),
    ).toEqual({ status: 401, code: 'INVALID_CREDENTIALS', detail: 'x' });
  });
});

describe('problemSchema', () => {
  it('accepts what buildProblem emits, with and without errors', () => {
    const plain = buildProblem(404, 'NOT_FOUND', 'x', 'id');
    const withErrors = buildProblem(400, 'VALIDATION_FAILED', 'x', 'id', [
      { pointer: '/a', message: 'm' },
    ]);
    expect(problemSchema.parse(plain)).toEqual(plain);
    expect(problemSchema.parse(withErrors)).toEqual(withErrors);
  });
});
