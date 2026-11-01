# Notes

- **Coverage command exits 1.** The prescribed `vitest run --project unit --coverage` fails the global 80% gate, both with and without this change (base: 60% lines; after: 63%). The cause is that `health` and `shared/db.ts` are only exercised by the integration project, which needs Docker. The domain 100% gate passes; I confirmed `src/modules/*/domain/**` is at 100% with a domain-only run. In a real run, `pnpm verify` (all projects) is the gate, and I could not run it here.
- **TDD seam confirmation.** The tdd skill says to confirm seams with the user before writing tests. There was no user to ask, so I took the seam as pre-agreed by issue Decision 1 and the implementer file's "pure rules in domain/ get unit tests".
- **`/code-review` skipped** as the implementer file says (the reviewers replace it).
- **Spec source.** The input file stood in for `gh issue view 90 --comments`; there was no PRD link, Contract or `Chosen:` comment to read. No push, no PR: `pr-body.md` holds the body I would have posted. PR title would be `feat: add validateThresholds to AgingPolicy (closes #90)`.
- **Possible tension for build step 6 (not acted on):** the issue says a bad request should get "a clear 400", while the design doc's error list (line 404) reserves 422 for "valid shape, invalid meaning", which fits thresholds that parse but break the rule. This issue has no endpoint, so nothing here depends on it, and I did not raise `decision-needed:`. The dealerships slice should settle it.
- **Reason strings** are my wording; the issue only asks that they name the broken rule. When several rules are broken, the first in order (integers, watch >= 1, watch < aging, aging <= 3650) is reported.
- Ran `format:check` as well, since it is part of `pnpm verify` and needs no Docker.
