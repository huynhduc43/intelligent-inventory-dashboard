-- Backfill for ADR 0017: intake now trims make and model and collapses inner whitespace runs to one space.
UPDATE "vehicle"
SET "make" = btrim(regexp_replace("make", '[[:space:]]+', ' ', 'g')),
    "model" = btrim(regexp_replace("model", '[[:space:]]+', ' ', 'g'))
WHERE "make" <> btrim(regexp_replace("make", '[[:space:]]+', ' ', 'g'))
   OR "model" <> btrim(regexp_replace("model", '[[:space:]]+', ' ', 'g'));
