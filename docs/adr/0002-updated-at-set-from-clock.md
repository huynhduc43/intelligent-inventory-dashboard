# `updated_at` is set by the service from `Clock`, not by the database

`vehicle.updated_at` has `DEFAULT now()` for inserts only. Every update sets `updatedAt: clock.now()` in the owning service; there is no trigger and no Drizzle `$onUpdate`. A schema-level callback or trigger cannot reach the injected `Clock`, so tests could not pin the timestamp, which breaks the rule that `now` is injected and pinnable.

The cost is that every writer of `vehicle` must remember to set the column. Raw SQL writes (the conditional `UPDATE … WHERE status = ANY(…)`) set it explicitly.
