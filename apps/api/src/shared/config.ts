import { z } from 'zod';

// An empty variable counts as missing, so `FOO=` in a .env file falls back to the default or fails.
const env = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema);

const int = (min: number, max: number) =>
  z.coerce
    .number({ error: 'must be an integer' })
    .int('must be an integer')
    .min(min, `must be >= ${String(min)}`)
    .max(max, `must be <= ${String(max)}`);

const schema = z.object({
  PORT: env(int(1, 65535).default(3000)),
  LOG_LEVEL: env(
    z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'], {
        error: 'must be one of fatal, error, warn, info, debug, trace, silent',
      })
      .default('info'),
  ),
  DATABASE_URL: env(
    z
      .string({ error: 'required' })
      .regex(/^postgres(ql)?:\/\/\S+$/, 'must be a postgres:// URL'),
  ),
  DB_STATEMENT_TIMEOUT_MS: env(int(1, 600_000).default(5000)),
  JWT_SECRET: env(
    z.string({ error: 'required' }).min(32, 'must be at least 32 characters'),
  ),
  JWT_TTL_S: env(int(1, 86_400).default(3600)),
});

export type AppConfig = z.infer<typeof schema>;

/** Injection token for the parsed {@link AppConfig}. */
export const APP_CONFIG = Symbol('APP_CONFIG');

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Parses the environment once at startup; throws a ConfigError naming every bad variable (never its value). */
export function loadConfig(
  source: Record<string, string | undefined>,
): AppConfig {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const lines = result.error.issues.map(
    (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
  );
  throw new ConfigError(
    ['Invalid environment configuration:', ...lines].join('\n'),
  );
}
