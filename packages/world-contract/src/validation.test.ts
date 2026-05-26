import { describe, it, expect } from 'vitest';
import { validateManifest } from './validation.js';
import { fixtureManifest } from './test-fixtures.js';

describe('validateManifest', () => {
  it('accepts a well-formed fixture manifest', () => {
    const result = validateManifest(fixtureManifest());
    if (!result.valid) {
      console.error(result.errors);
    }
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a manifest missing `identity`', () => {
    const bad = { ...fixtureManifest() } as Record<string, unknown>;
    delete bad['identity'];
    const result = validateManifest(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.params['missingProperty'] === 'identity')).toBe(true);
  });

  it('rejects a layer with an unknown dtype', () => {
    const manifest = fixtureManifest();
    const bad = JSON.parse(JSON.stringify(manifest));
    bad.layers[0].dtype = 'f64';
    const result = validateManifest(bad);
    expect(result.valid).toBe(false);
  });

  it('rejects a sha256 that is not 64 lowercase hex chars', () => {
    const manifest = fixtureManifest();
    const bad = JSON.parse(JSON.stringify(manifest));
    bad.layers[0].resource.sha256 = 'NOT_HEX';
    const result = validateManifest(bad);
    expect(result.valid).toBe(false);
  });

  it('rejects a schemaVersion that is not semver', () => {
    const manifest = fixtureManifest();
    const bad = JSON.parse(JSON.stringify(manifest));
    bad.identity.schemaVersion = '1';
    const result = validateManifest(bad);
    expect(result.valid).toBe(false);
  });

  it('rejects unknown top-level properties (additionalProperties: false)', () => {
    const manifest = fixtureManifest();
    const bad: Record<string, unknown> = { ...JSON.parse(JSON.stringify(manifest)), surprise: 1 };
    const result = validateManifest(bad);
    expect(result.valid).toBe(false);
  });

  it('rejects a createdAt that is not ISO-8601 date-time', () => {
    const manifest = fixtureManifest();
    const bad = JSON.parse(JSON.stringify(manifest));
    bad.identity.createdAt = 'yesterday';
    const result = validateManifest(bad);
    expect(result.valid).toBe(false);
  });
});
