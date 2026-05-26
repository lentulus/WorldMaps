import { describe, it, expect } from 'vitest';
import { createRng, hashSeed } from './rng.js';

describe('RNG', () => {
  it('produces the same sequence for the same string seed within a process', () => {
    const a = createRng('hello');
    const b = createRng('hello');
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng('alpha');
    const b = createRng('beta');
    const seqA = Array.from({ length: 32 }, () => a.next());
    const seqB = Array.from({ length: 32 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('emits values in [0, 1)', () => {
    const r = createRng('values');
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('hashSeed maps equal strings to equal u32 and differs on tiny edits', () => {
    expect(hashSeed('foo')).toBe(hashSeed('foo'));
    expect(hashSeed('foo')).not.toBe(hashSeed('fop'));
  });

  it('range stays within bounds', () => {
    const r = createRng('range');
    for (let i = 0; i < 1000; i++) {
      const v = r.range(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
    }
  });

  it('int returns integers in [0, n)', () => {
    const r = createRng('int');
    for (let i = 0; i < 1000; i++) {
      const v = r.int(7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });
});
