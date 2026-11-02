# Request validation uses zod through Nest's Standard Schema pipe, not class-validator

§4.1 names Nest's class-validator `ValidationPipe`. We validate request bodies, queries and path parameters with zod 4 schemas through Nest 12's built-in `StandardSchemaValidationPipe` instead, with `z.strictObject` so unknown fields are rejected. zod already validates the config, so this keeps one validation library and adds no dependency, where class-validator would add two and a second, decorator-based style.

The pipe's `exceptionFactory` maps zod issues to the `400 VALIDATION_FAILED` problem's `errors[{ pointer, message }]` (§4.8). Pointers are RFC 6901 JSON Pointers into the validated input (body, query or params), so the query parameter `limit` is `/limit`. Unknown keys, which zod reports once on the parent object, get one item each.

Supersedes the `ValidationPipe` mention in §4.1 of `docs/research/backend-architecture.md`.
