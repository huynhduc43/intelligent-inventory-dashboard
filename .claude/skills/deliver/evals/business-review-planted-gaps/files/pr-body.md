Closes #11

## Summary
Actions module: log and list actions.

## Evidence
| Criterion | Test |
| --- | --- |
| log on IN_STOCK -> 201 | actions.spec.ts "logs an action" |
| RESERVED/SOLD | actions.spec.ts "rejects a sold vehicle" |
| non-member / viewer | actions.spec.ts "forbids outsiders" |
| list newest first | actions.spec.ts "lists newest first" |

## Deviations
None.

## Manual steps
None.
