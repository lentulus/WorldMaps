import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { manifestJsonSchema } from './schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const jsonPath = resolve(here, '../schema/world-manifest.schema.json');

describe('schema TS/JSON parity', () => {
  it('packages/world-contract/schema/world-manifest.schema.json equals manifestJsonSchema', () => {
    const jsonRaw = readFileSync(jsonPath, 'utf-8');
    const jsonParsed = JSON.parse(jsonRaw);
    expect(jsonParsed).toEqual(manifestJsonSchema);
  });
});
