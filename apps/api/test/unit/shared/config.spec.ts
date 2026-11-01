import { ConfigError, loadConfig } from '../../../src/shared/config.js';

const valid = {
  DATABASE_URL: 'postgres://app:app@localhost:5432/inventory',
  JWT_SECRET: 'x'.repeat(32),
};

function errorOf(env: Record<string, string | undefined>): ConfigError {
  try {
    loadConfig(env);
  } catch (e) {
    if (e instanceof ConfigError) return e;
    throw e;
  }
  throw new Error('expected loadConfig to throw');
}

describe('loadConfig', () => {
  it('applies the §4.13 defaults', () => {
    expect(loadConfig(valid)).toEqual({
      ...valid,
      PORT: 3000,
      LOG_LEVEL: 'info',
      DB_STATEMENT_TIMEOUT_MS: 5000,
      JWT_TTL_S: 3600,
    });
  });

  it('parses numeric overrides', () => {
    const config = loadConfig({
      ...valid,
      PORT: '8080',
      DB_STATEMENT_TIMEOUT_MS: '250',
      JWT_TTL_S: '60',
      LOG_LEVEL: 'debug',
    });

    expect(config).toMatchObject({
      PORT: 8080,
      DB_STATEMENT_TIMEOUT_MS: 250,
      JWT_TTL_S: 60,
      LOG_LEVEL: 'debug',
    });
  });

  it.each([
    ['missing DATABASE_URL', { JWT_SECRET: valid.JWT_SECRET }, 'DATABASE_URL'],
    ['empty DATABASE_URL', { ...valid, DATABASE_URL: '' }, 'DATABASE_URL'],
    [
      'non-postgres DATABASE_URL',
      { ...valid, DATABASE_URL: 'http://x' },
      'DATABASE_URL',
    ],
    ['missing JWT_SECRET', { DATABASE_URL: valid.DATABASE_URL }, 'JWT_SECRET'],
    [
      'short JWT_SECRET',
      { ...valid, JWT_SECRET: 'x'.repeat(31) },
      'JWT_SECRET',
    ],
    ['non-numeric PORT', { ...valid, PORT: 'abc' }, 'PORT'],
    ['out-of-range PORT', { ...valid, PORT: '70000' }, 'PORT'],
    ['unknown LOG_LEVEL', { ...valid, LOG_LEVEL: 'loud' }, 'LOG_LEVEL'],
    [
      'zero DB_STATEMENT_TIMEOUT_MS',
      { ...valid, DB_STATEMENT_TIMEOUT_MS: '0' },
      'DB_STATEMENT_TIMEOUT_MS',
    ],
  ])('reports %s by name', (_case, env, variable) => {
    expect(errorOf(env).message).toMatch(new RegExp(`^  ${variable}: `, 'm'));
  });

  it('reports every offending variable at once', () => {
    const { message } = errorOf({ PORT: 'abc' });

    expect(message).toMatch(/^Invalid environment configuration:/);
    expect(message).toContain('DATABASE_URL: required');
    expect(message).toContain('JWT_SECRET: required');
    expect(message).toMatch(/PORT: /);
  });

  it('never echoes a secret value', () => {
    expect(
      errorOf({ ...valid, JWT_SECRET: 'short-secret' }).message,
    ).not.toContain('short-secret');
  });
});
