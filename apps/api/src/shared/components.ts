import type { ReferenceObject, SchemaObject } from '@nestjs/swagger';

/** Named OpenAPI schemas; `buildDocument` merges them into `components.schemas` (ADR 0016). */
export const componentSchemas: Record<string, SchemaObject> = {};

/**
 * Registers `schema` under `name` and returns the `$ref` to put where the schema would go.
 * Throws if `name` already holds a different schema, so a clash fails at boot.
 */
export function component(name: string, schema: SchemaObject): ReferenceObject {
  const existing = componentSchemas[name];
  if (existing && existing !== schema)
    throw new Error(`OpenAPI component "${name}" is already registered`);
  componentSchemas[name] = schema;
  return { $ref: `#/components/schemas/${name}` };
}
