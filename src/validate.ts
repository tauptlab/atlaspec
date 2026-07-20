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
    const diagnostics = schemaErrorsToDiagnostics(validateSchema.errors ?? [])
      .sort(compareDiagnostics);

    return { valid: false, diagnostics };
  }

  const diagnostics = lintAtlaspec(value).sort(compareDiagnostics);
  return {
    valid: diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
    diagnostics,
  };
}

function schemaErrorsToDiagnostics(errors: readonly ErrorObject[]): Diagnostic[] {
  const enumValues = new Map<string, unknown[]>();
  for (const error of errors) {
    if (error.keyword !== 'const') continue;
    const values = enumValues.get(error.instancePath) ?? [];
    values.push(error.params['allowedValue']);
    enumValues.set(error.instancePath, values);
  }

  const diagnostics: Diagnostic[] = [];
  for (const [path, values] of enumValues) {
    const unique = [...new Map(values.map((value) => [JSON.stringify(value), value])).values()];
    diagnostics.push({
      code: 'schema.enum',
      severity: 'error',
      message: `Must be one of: ${unique.map((value) => JSON.stringify(value)).join(', ')}.`,
      path: path || '/',
    });
  }
  for (const error of errors) {
    if (error.keyword === 'const') continue;
    if (error.keyword === 'anyOf' && enumValues.has(error.instancePath)) continue;
    diagnostics.push(schemaErrorToDiagnostic(error));
  }

  const unique = new Map<string, Diagnostic>();
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.code}\u0000${diagnostic.path}\u0000${diagnostic.message}`;
    unique.set(key, diagnostic);
  }
  return [...unique.values()];
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
