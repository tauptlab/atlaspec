import { Ajv } from 'ajv';
import type { ErrorObject } from 'ajv';

import {
  compareDiagnostics,
  type Diagnostic,
  type ValidationReport,
} from './diagnostics.js';
import { lintAtlaspec } from './lint.js';
import { AtlaspecSchema, type AtlaspecDocument } from './schema.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile<AtlaspecDocument>(AtlaspecSchema);

export function validateAtlaspec(value: unknown): ValidationReport {
  if (!validateSchema(value)) {
    const diagnostics = (validateSchema.errors ?? [])
      .map(schemaErrorToDiagnostic)
      .sort(compareDiagnostics);

    return { valid: false, diagnostics };
  }

  const diagnostics = lintAtlaspec(value).sort(compareDiagnostics);
  return {
    valid: diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
    diagnostics,
  };
}

function schemaErrorToDiagnostic(error: ErrorObject): Diagnostic {
  const additionalProperty =
    error.keyword === 'additionalProperties' &&
    typeof error.params['additionalProperty'] === 'string'
      ? `/${escapePointer(error.params['additionalProperty'])}`
      : '';

  return {
    code: `schema.${error.keyword}`,
    severity: 'error',
    message: error.message ?? 'Schema validation failed.',
    path: `${error.instancePath}${additionalProperty}` || '/',
  };
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}
