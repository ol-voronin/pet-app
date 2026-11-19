import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateOpenApi } from '../openapi.js';

const out = process.argv[2];
if (!out) throw new Error('Usage: export-openapi <output.json>');
writeFileSync(resolve(out), await generateOpenApi());
console.log(`OpenAPI spec written to ${out}`);
