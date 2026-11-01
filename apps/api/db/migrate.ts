// Applies db/migrations once (`pnpm db:migrate`, or the Compose `migrate` service). The app never migrates at boot.
// Runs with Node's type stripping, so it imports packages only, no local .ts files.
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const url = process.env.DATABASE_URL;
if (!url) {
  process.stderr.write('DATABASE_URL is required\n');
  process.exit(1);
}

const db = drizzle(url);
await migrate(db, {
  migrationsFolder: `${import.meta.dirname}/migrations`,
});
await db.$client.end();
process.stdout.write('Migrations applied\n');
