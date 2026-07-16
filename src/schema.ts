import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';

const Strict = { additionalProperties: false } as const;

export const MeasurementLevelSchema = Type.Union([
  Type.Literal('nominal'),
  Type.Literal('ordinal'),
  Type.Literal('quantitative'),
  Type.Literal('temporal'),
]);

export const SemanticTypeSchema = Type.Union([
  Type.Literal('category'),
  Type.Literal('count'),
  Type.Literal('rate'),
  Type.Literal('probability'),
  Type.Literal('delta'),
  Type.Literal('rank'),
  Type.Literal('capacity'),
  Type.Literal('uncertainty'),
  Type.Literal('identifier'),
  Type.Literal('label'),
]);

export const SpatialSupportSchema = Type.Union([
  Type.Literal('point'),
  Type.Literal('line'),
  Type.Literal('polygon'),
  Type.Literal('grid'),
]);

export const MapFamilySchema = Type.Union([
  Type.Literal('choropleth'),
  Type.Literal('proportional-symbol'),
  Type.Literal('categorical-point'),
  Type.Literal('heatmap'),
]);

const GeoJsonFeatureCollectionSchema = Type.Object(
  {
    type: Type.Literal('FeatureCollection'),
    features: Type.Array(Type.Unknown()),
  },
  { additionalProperties: true },
);

const GeoJsonUrlSourceSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    type: Type.Literal('geojson'),
    url: Type.String({ minLength: 1 }),
  },
  Strict,
);

const GeoJsonInlineSourceSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    type: Type.Literal('geojson'),
    data: GeoJsonFeatureCollectionSchema,
  },
  Strict,
);

export const DataSourceSchema = Type.Union([
  GeoJsonUrlSourceSchema,
  GeoJsonInlineSourceSchema,
]);

export const FieldSchema = Type.Object(
  {
    source: Type.String({ minLength: 1 }),
    path: Type.String({ minLength: 1 }),
    measurement: MeasurementLevelSchema,
    semantic_type: SemanticTypeSchema,
    unit: Type.Optional(Type.String({ minLength: 1 })),
    normalization: Type.Optional(
      Type.Union([
        Type.Literal('none'),
        Type.Literal('ratio'),
        Type.Literal('per-capita'),
        Type.Literal('density'),
      ]),
    ),
    range: Type.Optional(
      Type.Tuple([Type.Number(), Type.Number()]),
    ),
    domain: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), {
        minItems: 1,
        uniqueItems: true,
      }),
    ),
  },
  Strict,
);

const GeometryEncodingSchema = Type.Object(
  {
    source: Type.String({ minLength: 1 }),
    support: SpatialSupportSchema,
  },
  Strict,
);

const FieldEncodingSchema = Type.Object(
  {
    field: Type.String({ minLength: 1 }),
  },
  Strict,
);

const ColorEncodingSchema = Type.Object(
  {
    field: Type.String({ minLength: 1 }),
    scheme: Type.Optional(Type.String({ minLength: 1 })),
    classification: Type.Optional(
      Type.Union([
        Type.Literal('continuous'),
        Type.Literal('equal-interval'),
        Type.Literal('quantile'),
        Type.Literal('natural-breaks'),
      ]),
    ),
    classes: Type.Optional(Type.Integer({ minimum: 2, maximum: 12 })),
  },
  Strict,
);

export const EncodingSchema = Type.Object(
  {
    geometry: GeometryEncodingSchema,
    color: Type.Optional(ColorEncodingSchema),
    size: Type.Optional(FieldEncodingSchema),
    category: Type.Optional(FieldEncodingSchema),
    label: Type.Optional(FieldEncodingSchema),
    weight: Type.Optional(FieldEncodingSchema),
  },
  Strict,
);

const IntentSchema = Type.Object(
  {
    task: Type.Union([
      Type.Literal('locate'),
      Type.Literal('compare'),
      Type.Literal('rank'),
      Type.Literal('distribution'),
      Type.Literal('distinguish'),
    ]),
    audience: Type.Union([
      Type.Literal('general-public'),
      Type.Literal('analyst'),
      Type.Literal('expert'),
      Type.Literal('operations'),
      Type.Literal('student'),
    ]),
    primary_message: Type.String({ minLength: 1 }),
  },
  Strict,
);

const ZoomRuleSchema = Type.Object(
  {
    min_zoom: Type.Optional(Type.Number({ minimum: 0, maximum: 24 })),
    max_zoom: Type.Optional(Type.Number({ minimum: 0, maximum: 24 })),
    target: Type.Union([
      Type.Literal('fill'),
      Type.Literal('symbols'),
      Type.Literal('labels'),
      Type.Literal('heatmap'),
    ]),
    action: Type.Union([
      Type.Literal('show'),
      Type.Literal('hide'),
      Type.Literal('cluster'),
      Type.Literal('show-labels'),
    ]),
  },
  Strict,
);

const ConstraintsSchema = Type.Object(
  {
    colorblind_safe: Type.Optional(Type.Boolean()),
    missing_data: Type.Optional(
      Type.Union([
        Type.Literal('explicit'),
        Type.Literal('hide'),
        Type.Literal('error'),
      ]),
    ),
    raw_count_choropleth: Type.Optional(
      Type.Union([Type.Literal('reject'), Type.Literal('allow')]),
    ),
    protected_layers: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
    ),
    label_priority: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
    ),
    viewport: Type.Optional(
      Type.Object(
        {
          width: Type.Integer({ minimum: 240, maximum: 7680 }),
          height: Type.Integer({ minimum: 240, maximum: 4320 }),
        },
        Strict,
      ),
    ),
  },
  Strict,
);

const BasemapSchema = Type.Object(
  {
    style: Type.Union([
      Type.Literal('minimal-light'),
      Type.Literal('minimal-dark'),
      Type.Literal('none'),
    ]),
    contrast: Type.Optional(
      Type.Union([
        Type.Literal('light'),
        Type.Literal('dark'),
        Type.Literal('auto'),
      ]),
    ),
  },
  Strict,
);

export const AtlaspecSchema = Type.Object(
  {
    version: Type.Literal('0.1'),
    map: Type.String({ minLength: 1, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }),
    title: Type.String({ minLength: 1 }),
    description: Type.Optional(Type.String({ minLength: 1 })),
    family: MapFamilySchema,
    intent: IntentSchema,
    data: Type.Object(
      {
        sources: Type.Array(DataSourceSchema, { minItems: 1 }),
        fields: Type.Record(Type.String({ minLength: 1 }), FieldSchema, {
          minProperties: 1,
        }),
      },
      Strict,
    ),
    encoding: EncodingSchema,
    constraints: Type.Optional(ConstraintsSchema),
    behavior: Type.Optional(
      Type.Object(
        {
          zoom_rules: Type.Array(ZoomRuleSchema),
        },
        Strict,
      ),
    ),
    basemap: Type.Optional(BasemapSchema),
    metadata: Type.Optional(
      Type.Record(
        Type.String({ minLength: 1 }),
        Type.Union([Type.String(), Type.Number(), Type.Boolean()]),
      ),
    ),
  },
  {
    $id: 'https://atlaspec.org/schema/0.1/atlaspec.json',
    additionalProperties: false,
  },
);

export type AtlaspecDocument = Static<typeof AtlaspecSchema>;
export type DataSource = Static<typeof DataSourceSchema>;
export type Field = Static<typeof FieldSchema>;
export type MapFamily = Static<typeof MapFamilySchema>;
export type MeasurementLevel = Static<typeof MeasurementLevelSchema>;
export type SemanticType = Static<typeof SemanticTypeSchema>;
export type SpatialSupport = Static<typeof SpatialSupportSchema>;
