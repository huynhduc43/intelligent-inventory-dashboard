import { Writable } from 'node:stream';
import { pino } from 'pino';
import { loadConfig } from '../../../src/shared/config.js';
import { pinoOptions } from '../../../src/shared/logging.js';

const config = loadConfig({
  DATABASE_URL: 'postgres://u:p@localhost/db',
  JWT_SECRET: 'x'.repeat(32),
});

describe('pinoOptions', () => {
  it('redacts authorization and passwords in a serialized line', () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    pino(pinoOptions(config), stream).info(
      {
        req: { headers: { authorization: 'Bearer secret', accept: 'x' } },
        body: { password: 'hunter2' },
      },
      'm',
    );

    const line = JSON.parse(lines[0] ?? '{}') as {
      level: string;
      req: { headers: Record<string, string> };
      body: { password: string };
    };
    expect(line.req.headers.authorization).toBe('[Redacted]');
    expect(line.req.headers.accept).toBe('x');
    expect(line.body.password).toBe('[Redacted]');
    expect(line.level).toBe('info');
    expect(lines[0]).not.toContain('secret');
    expect(lines[0]).not.toContain('hunter2');
  });
});
