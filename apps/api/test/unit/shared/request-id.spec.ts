import { resolveRequestId } from '../../../src/shared/request-id.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it.each(['abc-123', 'A.b_c-9', 'a'.repeat(128)])('reuses %s', (id) => {
    expect(resolveRequestId(id)).toBe(id);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['129 characters', 'a'.repeat(129)],
    ['a space', 'a b'],
    ['joined duplicates', 'abc, def'],
    ['a slash', 'a/b'],
    ['a plus', 'a+b'],
    ['a colon', 'a:b'],
    ['an array', ['abc']],
  ])('replaces %s with a generated UUID', (_name, value) => {
    expect(resolveRequestId(value)).toMatch(UUID);
  });
});
