import { writeFileSync } from 'node:fs';
import { generateOpenApi } from './shared/docs.js';

const out = `${import.meta.dirname}/../../../docs/api/openapi.json`;
writeFileSync(out, `${JSON.stringify(await generateOpenApi(), null, 2)}\n`);
