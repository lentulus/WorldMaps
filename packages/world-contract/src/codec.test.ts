import { describe, it, expect } from 'vitest';
import { encodeManifest, decodeManifest } from './codec.js';
import { fixtureManifest } from './test-fixtures.js';

describe('manifest codec', () => {
  it('round-trips a fixture manifest to byte equality', () => {
    const manifest = fixtureManifest();
    const bytesA = encodeManifest(manifest);
    const decoded = decodeManifest(bytesA);
    const bytesB = encodeManifest(decoded);
    expect(bytesA.length).toBe(bytesB.length);
    expect(bytesA).toEqual(bytesB);
  });

  it('decoded manifest is deep-equal to original', () => {
    const manifest = fixtureManifest();
    const decoded = decodeManifest(encodeManifest(manifest));
    expect(decoded).toEqual(manifest);
  });
});
