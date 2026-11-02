import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  DocumentBuilder,
  type OpenAPIObject,
  type SchemaObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { z } from 'zod';
import { AppModule } from '../app.module.js';
import { loadConfig } from './config.js';
import { problemSchema } from './problem.js';

// src/shared and dist/shared are both two levels below the package root.
const { version } = JSON.parse(
  readFileSync(`${import.meta.dirname}/../../package.json`, 'utf8'),
) as { version: string };

const problemRef = {
  'application/problem+json': {
    schema: { $ref: '#/components/schemas/Problem' },
  },
};

export function buildDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Intelligent Inventory Dashboard API')
    .setVersion(version)
    .addBearerAuth()
    .addGlobalResponse(
      { status: 400, description: 'Validation failed', content: problemRef },
      { status: 401, description: 'Unauthenticated', content: problemRef },
      { status: 500, description: 'Unexpected error', content: problemRef },
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  // swagger cannot convert a zod response type, so the shared error shape is registered by hand.
  document.components ??= {};
  document.components.schemas = {
    ...document.components.schemas,
    Problem: z.toJSONSchema(problemSchema, {
      target: 'openapi-3.0',
    }) as SchemaObject,
  };
  return document;
}

/** Swagger UI at /docs, JSON at /docs-json. Called from main.ts only, so tests do not mount it. */
export function setupDocs(app: INestApplication): void {
  SwaggerModule.setup('docs', app, buildDocument(app));
}

/** The exported document: boots the app without listening; the pool connects lazily, so the DATABASE_URL is a dummy. */
export async function generateOpenApi(): Promise<OpenAPIObject> {
  const app = await NestFactory.create(
    AppModule.forRoot(
      loadConfig({
        DATABASE_URL: 'postgres://openapi:openapi@localhost:5432/openapi',
        JWT_SECRET: 'openapi-export-openapi-export-openapi-export',
        LOG_LEVEL: 'silent',
      }),
    ),
    { logger: false },
  );
  try {
    return buildDocument(app);
  } finally {
    await app.close();
  }
}
