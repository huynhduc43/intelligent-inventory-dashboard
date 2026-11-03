import assert from 'node:assert/strict';
import { test } from 'node:test';
import { check } from './check-evidence.mjs';

const TESTS = {
  'settings.spec.ts': [
    {
      path: 'apps/api/test/integration/settings.spec.ts',
      source: "it('PATCH is 403 for Manager'); it('GET rejects non-members')",
    },
  ],
  'rbac.spec.ts': [
    {
      path: 'apps/api/test/integration/rbac.spec.ts',
      source: "it('settings GET and PATCH: roles, non-member 404')",
    },
  ],
  'aging-policy.spec.ts': [
    {
      path: 'apps/api/test/unit/inventory/aging-policy.spec.ts',
      source: "describe('validateThresholds')",
    },
  ],
};
const find = (base) => TESTS[base] ?? [];
const issue = `## Acceptance criteria

1. Route × role. \`rbac.spec.ts\` rows + Tester.
2. Bounds. Unit test.

## Testing Decisions`;
const body = (
  row1,
  row2 = '`aging-policy.spec.ts › validateThresholds`',
) => `## Evidence

| AC | Test |
| --- | --- |
| 1 | ${row1} |
| 2 | ${row2} |

## Doc impact`;

test('passes when every criterion cites an existing test at its level', () => {
  const row =
    '`settings.spec.ts › PATCH is 403 for Manager`; `› GET rejects non-members`; `rbac.spec.ts › settings GET and PATCH: roles, …`';
  assert.deepEqual(check(body(row), issue, find), []);
});

// PR #79's first push: AC 11 named rbac.spec.ts but cited only settings.spec.ts and a prose "probe".
test('fails a criterion that names rbac.spec.ts but cites none of its tests', () => {
  const row =
    '`settings.spec.ts › PATCH is 403 for Manager`; permission rows in `rbac.spec.ts` (probe)';
  assert.deepEqual(check(body(row), issue, find), [
    'AC 1: names rbac.spec.ts, but no cited test is one',
  ]);
});

test('fails a cited test name that does not exist', () => {
  const row = '`rbac.spec.ts › settings GET and PATCH: roles, non-member 404`';
  assert.deepEqual(
    check(
      body(row, '`aging-policy.spec.ts › watch 0 is rejected`'),
      issue,
      find,
    ),
    [
      'AC 2: `aging-policy.spec.ts › watch 0 is rejected` not found',
      'AC 2: cites no test that exists (`file › test name`)',
    ],
  );
});

test('fails a unit-test criterion covered only by an integration test', () => {
  const row = '`rbac.spec.ts › settings GET and PATCH: roles, non-member 404`';
  assert.deepEqual(
    check(
      body(row, '`settings.spec.ts › PATCH is 403 for Manager`'),
      issue,
      find,
    ),
    ['AC 2: names unit test, but no cited test is one'],
  );
});

test('fails a criterion with no Evidence row', () => {
  const only1 = body('`rbac.spec.ts › settings GET`').replace(/^\| 2 .*$/m, '');
  assert.deepEqual(check(only1, issue, find), ['AC 2: no Evidence row']);
});
