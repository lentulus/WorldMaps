import { describe, it, expect } from 'vitest';
import type { AnnotationAnchor } from './annotation.js';
import type { LayerDescriptor } from './layer.js';
import { dtypeByteSize, expectedLayerByteLength } from './layer.js';

function assertNever(x: never): never {
  throw new Error(`unreachable: ${JSON.stringify(x)}`);
}

function describeAnchor(a: AnnotationAnchor): string {
  switch (a.kind) {
    case 'point':
      return `point@${a.regionId}`;
    case 'region':
      return `region@${a.regionId}`;
    case 'region-set':
      return `region-set(${a.regionIds.length})`;
    case 'border':
      return `border(${a.edgeIds.length})`;
    case 'polyline':
      return `polyline(${a.points.length})`;
    case 'polygon':
      return `polygon(${a.points.length})`;
    default:
      return assertNever(a);
  }
}

describe('AnnotationAnchor discriminant', () => {
  it('exhausts all kinds without a `never` leak', () => {
    const anchors: AnnotationAnchor[] = [
      { kind: 'point', regionId: 0, lat: 0, lon: 0 },
      { kind: 'region', regionId: 1 },
      { kind: 'region-set', regionIds: [1, 2, 3] },
      { kind: 'border', edgeIds: [10, 11] },
      { kind: 'polyline', points: [[0, 0]] },
      { kind: 'polygon', points: [[0, 0], [1, 1], [2, 0]] },
    ];
    const descriptions = anchors.map(describeAnchor);
    expect(descriptions).toHaveLength(6);
  });
});

describe('layer dtype helpers', () => {
  it('byte sizes match the contract', () => {
    expect(dtypeByteSize('f32')).toBe(4);
    expect(dtypeByteSize('i32')).toBe(4);
    expect(dtypeByteSize('u32')).toBe(4);
    expect(dtypeByteSize('u8')).toBe(1);
  });

  it('expectedLayerByteLength matches manifest declarations', () => {
    const elevation: LayerDescriptor = {
      name: 'elevation',
      kind: 'scalar',
      domain: 'region',
      dtype: 'f32',
      componentsPerEntry: 1,
      resource: { url: 'x', bytes: 64 * 4, sha256: 'a'.repeat(64) },
    };
    expect(expectedLayerByteLength(elevation, 64)).toBe(elevation.resource.bytes);

    const wind: LayerDescriptor = {
      name: 'wind',
      kind: 'vec2',
      domain: 'region',
      dtype: 'f32',
      componentsPerEntry: 2,
      resource: { url: 'x', bytes: 64 * 2 * 4, sha256: 'a'.repeat(64) },
    };
    expect(expectedLayerByteLength(wind, 64)).toBe(wind.resource.bytes);
  });
});
