import Ajv, { type ValidateFunction, type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { manifestJsonSchema } from './schema.js';
import type { WorldManifest } from './manifest.js';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateFn: ValidateFunction<WorldManifest> =
  ajv.compile<WorldManifest>(manifestJsonSchema);

export interface ManifestValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ErrorObject[];
}

export function validateManifest(value: unknown): ManifestValidationResult {
  const valid = validateFn(value);
  return {
    valid,
    errors: validateFn.errors ?? [],
  };
}
