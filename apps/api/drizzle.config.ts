import { defineConfig } from 'drizzle-kit';

// Used by `db:generate` only; it never connects to a database.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/shared/schema.ts',
  out: './db/migrations',
});
