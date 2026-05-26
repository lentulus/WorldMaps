import type { ResourceRef } from './resource.js';

export type LayerKind = 'scalar' | 'vec2' | 'categorical';
export type LayerDomain = 'region' | 'edge';
export type LayerDtype = 'f32' | 'i32' | 'u8' | 'u32';

export interface LayerDescriptor {
  readonly name: string;
  readonly kind: LayerKind;
  readonly domain: LayerDomain;
  readonly dtype: LayerDtype;
  readonly componentsPerEntry: number;
  readonly range?: readonly [number, number];
  readonly units?: string;
  readonly resource: ResourceRef;
}

export function dtypeByteSize(dtype: LayerDtype): number {
  switch (dtype) {
    case 'f32':
    case 'i32':
    case 'u32':
      return 4;
    case 'u8':
      return 1;
  }
}

export function expectedLayerByteLength(
  descriptor: LayerDescriptor,
  entryCount: number,
): number {
  return entryCount * descriptor.componentsPerEntry * dtypeByteSize(descriptor.dtype);
}
