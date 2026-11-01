# Migrations run outside the app, not at boot

The API never migrates on startup. drizzle-kit generates SQL committed under `apps/api/db/migrations/`, and `pnpm db:migrate` (`apps/api/db/migrate.ts`) applies it once per release; Docker Compose runs it as a one-shot `migrate` service before the api starts. Booting a migration from every replica races, and a failed migration should stop the release, not crash-loop the app. The cost is one extra step per deploy (see `docs/environment-setup.md`).

`0000_init` must not be edited once merged; later schema changes ship as new migrations.
