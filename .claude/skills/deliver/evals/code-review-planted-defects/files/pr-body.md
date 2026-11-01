Closes #11

## Summary
Adds the actions module: list and log actions.

## Evidence
| Criterion | Test |
| --- | --- |
| list newest first | test/integration/actions.spec.ts "lists newest first" |
| log on IN_STOCK | test/integration/actions.spec.ts "logs an action" |
| RESERVED/SOLD -> 409 | test/integration/actions.spec.ts "rejects a sold vehicle" |

## Deviations
None.

## Manual steps
None.
