# Notes and uncertainty

- **No PR on GitHub.** Comment URLs in `report.md` are replaced with `findings.md#Fn` references. The inline line numbers are new-file line numbers counted from the hunks in `pr.diff`. The service hunk is abbreviated (`// ... imports`, hunk header `+1,40`), so its real line numbers could be offset by the elided imports.
- **Diff does not match the base.** The `config.ts` hunk's context (`JWT_TTL_S: z.coerce.number()...`) does not match the real `config.ts` on origin/dev, which uses the `env(int(...))` helpers. I reviewed what the hunk adds and did not raise the mismatch.
- **Not raised (code-reviewer territory, or not verifiable from a partial diff).**
  - `./action-type.js` (`ACTION_TYPES`), `../auth/require-permission.decorator.js`, `AuthedRequest` and an `actions.module.ts` and its app.module wiring are absent from both the diff and origin/dev, where auth is build step 2 and not yet built. As shown, the code would not compile or be routed.
  - Because `ACTION_TYPES` is not visible, I could not check that the enum matches D4.
  - Because the global `ValidationPipe` is not in the diff, I could not check the 400 `VALIDATION_FAILED` and unknown-field rejection.
- **Severity calls.** F3 is rated blocker because the required env var with no default makes the app fail to start wherever it is not set. F8 is rated blocker because the Evidence cites tests that do not exist. F9 is rated minor. F7 (GET on a missing vehicle returns 200) is a reading of "404" in the Contract and §4.8 that the issue does not state explicitly, so it is minor.
- **Grouping.** The missing environment-setup.md and Manual steps entries share a cause with the new env var (Decision 3), so per rule 6 they are inside F3, not a separate finding.
- **Departures from the agent file.** I used the skill's own code-review flow but ran no `git diff origin/dev...HEAD`, because that diff is empty in the sandbox; `pr.diff` stood in for it. Otherwise I followed the file as written, with posting replaced by files as the dry-run rule requires.
