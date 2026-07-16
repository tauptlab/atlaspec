export {
  AtlaspecSchema,
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
  DataSource,
  Field,
  MapFamily,
  MeasurementLevel,
  SemanticType,
  SpatialSupport,
} from './schema.js';

export { lintAtlaspec } from './lint.js';
export { loadDocument, parseDocument } from './load.js';
export { compileMapLibre } from './maplibre.js';
export { validateAtlaspec } from './validate.js';

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
