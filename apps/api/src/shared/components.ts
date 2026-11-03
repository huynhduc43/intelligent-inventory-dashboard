import type { ReferenceObject, SchemaObject } from '@nestjs/swagger';

/** Named OpenAPI schemas; `buildDocument` merges them into `components.schemas` (ADR 0016). */
export const componentSchemas: Record<string, SchemaObject> = {};

/** Registers `schema` under `name` and returns the `$ref` to put where the schema would go. */
export function component(name: string, schema: SchemaObject): ReferenceObject {
  componentSchemas[name] = schema;
  return { $ref: `#/components/schemas/${name}` };
}
