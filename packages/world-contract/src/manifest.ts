import type { WorldIdentity, SamplingMethod } from './identity.js';
import type { LayerDescriptor } from './layer.js';
import type { ResourceRef } from './resource.js';

export interface IseaProjection {
  readonly depth: number;
  readonly aperture: 3 | 4;
  readonly resource: ResourceRef;
}

export interface WorldManifest {
  readonly identity: WorldIdentity;

  readonly numRegions: number;
  readonly numEdges: number;

  readonly resolution: {
    readonly samplingMethod: SamplingMethod;
    readonly targetRegions: number;
    readonly actualRegions: number;
  };

  readonly layers: readonly LayerDescriptor[];

  readonly topology: {
    readonly neighbors: ResourceRef;
    readonly cellVertices: ResourceRef;
    readonly edges: ResourceRef;
  };

  readonly projections?: {
    readonly equirectangular?: ResourceRef;
    readonly isea?: readonly IseaProjection[];
  };
}
