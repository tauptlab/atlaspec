export {
  AtlaspecSchema,
  AtlaspecLayerSchema,
  AtlaspecV01Schema,
  AtlaspecV02Schema,
  DataSourceSchema,
  EncodingSchema,
  FieldSchema,
  MapFamilySchema,
  MeasurementLevelSchema,
  SemanticTypeSchema,
  SpatialSupportSchema,
} from './schema.js';

export type {
  AtlaspecDocument,
  AtlaspecLayer,
  AtlaspecV01Document,
  AtlaspecV02Document,
  DataSource,
  Field,
  MapFamily,
  MeasurementLevel,
  SemanticType,
  SpatialSupport,
} from './schema.js';

export { lintAtlaspec } from './lint.js';
export {
  AtlaspecMigrationError,
  downgradeAtlaspec,
  upgradeAtlaspec,
} from './migrate.js';
export { loadDocument, parseDocument } from './load.js';
export { compileMapLibre } from './maplibre.js';
export { validateAtlaspec } from './validate.js';
export {
  compileVegaLite,
  inspectVegaLiteCapabilities,
} from './vega-lite.js';

export type {
  Diagnostic,
  DiagnosticSeverity,
  ValidationReport,
} from './diagnostics.js';

export type {
  CompilationDecision,
  CompilationResult,
  MapLibreStyle,
} from './maplibre.js';

export type {
  VegaLiteCompilationResult,
  VegaLiteSpec,
} from './vega-lite.js';
