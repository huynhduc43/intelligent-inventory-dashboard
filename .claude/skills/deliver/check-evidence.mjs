#!/usr/bin/env node
// Fails when a PR's Evidence row cites no test that exists at the level its acceptance criterion names.
// Usage, in the PR's worktree: node .claude/skills/deliver/check-evidence.mjs <pr>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';

/** The text under `## <heading>` up to the next `## `. */
function section(md, heading) {
  const start = md.indexOf(`## ${heading}`);
  if (start < 0) return '';
  const rest = md.slice(start + heading.length + 3);
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
}

/** Levels a criterion names: a backticked spec file, `Unit test`, `Integration test`. */
function levels(criterion) {
  const files = [...criterion.matchAll(/`([\w.-]+\.spec\.ts)`/g)].map(
    (m) => m[1],
  );
  const out = files.map((f) => ({
    label: f,
    ok: (path) => path.endsWith(`/${f}`),
  }));
  if (/\bunit test/i.test(criterion))
    out.push({ label: 'unit test', ok: (p) => p.includes('/test/unit/') });
  if (/\bintegration test/i.test(criterion))
    out.push({
      label: 'integration test',
      ok: (p) => p.includes('/test/integration/'),
    });
  return out;
}

/** `file › name` citations in an Evidence cell; `› name` reuses the previous file. */
function citations(cell) {
  let file = null;
  const out = [];
  for (const [, span] of cell.matchAll(/`([^`]+)`/g)) {
    const m = span.match(/^\s*([\w.-]+\.spec\.ts)?\s*›\s*(.+?)\s*$/);
    if (!m) continue;
    file = m[1] ?? file;
    if (file) out.push({ file, name: m[2].replace(/\s*…$/, '') });
  }
  return out;
}

/**
 * @param {string} body PR body
 * @param {string} issue issue body with `## Acceptance criteria`
 * @param {(basename: string) => {path: string, source: string}[]} findTests test files with that basename
 * @returns {string[]} one line per uncovered criterion
 */
export function check(body, issue, findTests) {
  const criteria = [
    ...section(issue, 'Acceptance criteria').matchAll(/^(\d+)\.\s+(.+)$/gm),
  ];
  if (!criteria.length) return ['issue has no numbered ## Acceptance criteria'];
  const rows = new Map(
    [...section(body, 'Evidence').matchAll(/^\|\s*(\d+)\s*\|(.*)\|\s*$/gm)].map(
      (m) => [m[1], m[2]],
    ),
  );
  const problems = [];
  for (const [, n, text] of criteria) {
    const cell = rows.get(n);
    if (!cell) {
      problems.push(`AC ${n}: no Evidence row`);
      continue;
    }
    const found = [];
    for (const c of citations(cell)) {
      const hit = findTests(c.file).find((t) => t.source.includes(c.name));
      if (hit) found.push(hit.path);
      else problems.push(`AC ${n}: \`${c.file} › ${c.name}\` not found`);
    }
    if (!found.length) {
      problems.push(
        `AC ${n}: cites no test that exists (\`file › test name\`)`,
      );
      continue;
    }
    for (const level of levels(text))
      if (!found.some(level.ok))
        problems.push(
          `AC ${n}: names ${level.label}, but no cited test is one`,
        );
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fail = (msg) => {
    process.stderr.write(`${msg}\n`);
    process.exit(2);
  };
  const pr = process.argv[2];
  if (!pr) fail('usage: check-evidence.mjs <pr>');
  const sh = (...args) =>
    execFileSync(args[0], args.slice(1), { encoding: 'utf8' });
  const body = sh('gh', 'pr', 'view', pr, '--json', 'body', '-q', '.body');
  const issueNo = /\b(?:Closes|Fixes|Resolves) #(\d+)/i.exec(body)?.[1];
  if (!issueNo) fail(`PR #${pr} body has no "Closes #<issue>"`);
  const issue = sh(
    'gh',
    'issue',
    'view',
    issueNo,
    '--json',
    'body',
    '-q',
    '.body',
  );
  const files = sh('git', 'ls-files', '*.spec.ts').split('\n').filter(Boolean);
  const findTests = (base) =>
    files
      .filter((p) => p.endsWith(`/${base}`))
      .map((p) => ({ path: p, source: readFileSync(p, 'utf8') }));
  const problems = check(body, issue, findTests);
  const verdict = problems.length
    ? `${problems.length} problem(s) in PR #${pr} Evidence`
    : `every acceptance criterion of #${issueNo} cites an existing test at its level`;
  process.stdout.write(
    [...problems.map((p) => `uncovered: ${p}`), verdict].join('\n') + '\n',
  );
  process.exit(problems.length ? 1 : 0);
}
