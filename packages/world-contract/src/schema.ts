export const manifestJsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://worldmaps/schemas/world-manifest-1.0.0.json',
  title: 'WorldManifest',
  type: 'object',
  required: ['identity', 'numRegions', 'numEdges', 'resolution', 'layers', 'topology'],
  additionalProperties: false,
  properties: {
    identity: { $ref: '#/definitions/WorldIdentity' },
    numRegions: { type: 'integer', minimum: 0 },
    numEdges: { type: 'integer', minimum: 0 },
    resolution: {
      type: 'object',
      required: ['samplingMethod', 'targetRegions', 'actualRegions'],
      additionalProperties: false,
      properties: {
        samplingMethod: { enum: ['fibonacci', 'icosahedral'] },
        targetRegions: { type: 'integer', minimum: 1 },
        actualRegions: { type: 'integer', minimum: 1 },
      },
    },
    layers: {
      type: 'array',
      items: { $ref: '#/definitions/LayerDescriptor' },
    },
    topology: {
      type: 'object',
      required: ['neighbors', 'cellVertices', 'edges'],
      additionalProperties: false,
      properties: {
        neighbors: { $ref: '#/definitions/ResourceRef' },
        cellVertices: { $ref: '#/definitions/ResourceRef' },
        edges: { $ref: '#/definitions/ResourceRef' },
      },
    },
    projections: {
      type: 'object',
      additionalProperties: false,
      properties: {
        equirectangular: { $ref: '#/definitions/ResourceRef' },
        isea: {
          type: 'array',
          items: {
            type: 'object',
            required: ['depth', 'aperture', 'resource'],
            additionalProperties: false,
            properties: {
              depth: { type: 'integer', minimum: 0 },
              aperture: { enum: [3, 4] },
              resource: { $ref: '#/definitions/ResourceRef' },
            },
          },
        },
      },
    },
  },
  definitions: {
    WorldIdentity: {
      type: 'object',
      required: ['worldId', 'schemaVersion', 'generatorVersion', 'seed', 'params', 'createdAt'],
      additionalProperties: false,
      properties: {
        worldId: { type: 'string', minLength: 1 },
        schemaVersion: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
        generatorVersion: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
        seed: { type: 'string' },
        params: {
          type: 'object',
          required: ['numRegions', 'samplingMethod'],
          properties: {
            numRegions: { type: 'integer', minimum: 1 },
            samplingMethod: { enum: ['fibonacci', 'icosahedral'] },
          },
        },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    LayerDescriptor: {
      type: 'object',
      required: ['name', 'kind', 'domain', 'dtype', 'componentsPerEntry', 'resource'],
      additionalProperties: false,
      properties: {
        name: { type: 'string', minLength: 1 },
        kind: { enum: ['scalar', 'vec2', 'categorical'] },
        domain: { enum: ['region', 'edge'] },
        dtype: { enum: ['f32', 'i32', 'u8', 'u32'] },
        componentsPerEntry: { type: 'integer', minimum: 1 },
        range: {
          type: 'array',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2,
        },
        units: { type: 'string' },
        resource: { $ref: '#/definitions/ResourceRef' },
      },
    },
    ResourceRef: {
      type: 'object',
      required: ['url', 'bytes', 'sha256'],
      additionalProperties: false,
      properties: {
        url: { type: 'string', minLength: 1 },
        bytes: { type: 'integer', minimum: 0 },
        sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      },
    },
  },
} as const;
