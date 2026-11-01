# Enums are `text` + `CHECK`; time-zone validity is checked in the app

Status, role and action-type columns are `text` with a `CHECK`, not Postgres enum types, so adding a value is a plain constraint change instead of `ALTER TYPE`. `dealership.timezone` is plain `text NOT NULL`: a `CHECK` cannot query `pg_timezone_names`, so the dealerships module validates it on write. All time-zone arithmetic still runs in Postgres (`AT TIME ZONE`), so an invalid zone is rejected before it can reach a query.
