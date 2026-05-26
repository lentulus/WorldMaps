import type { WorldId } from './identity.js';

export type AnnotationAnchor =
  | { readonly kind: 'point'; readonly regionId: number; readonly lat: number; readonly lon: number }
  | { readonly kind: 'region'; readonly regionId: number }
  | { readonly kind: 'region-set'; readonly regionIds: readonly number[] }
  | { readonly kind: 'border'; readonly edgeIds: readonly number[] }
  | { readonly kind: 'polyline'; readonly points: ReadonlyArray<readonly [number, number]> }
  | { readonly kind: 'polygon'; readonly points: ReadonlyArray<readonly [number, number]> };

export interface Annotation<Payload = unknown> {
  readonly id: string;
  readonly worldId: WorldId;
  readonly schemaVersion: string;
  readonly anchor: AnnotationAnchor;
  readonly payload: Payload;
}
