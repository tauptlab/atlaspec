import {
  validateStyleMin,
  type StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import { parse as parseVega } from 'vega';
import { compile as compileVegaLite } from 'vega-lite';
import type { TopLevelSpec } from 'vega-lite';
import { parse as parseYaml } from 'yaml';

import { compileMapLibre } from '../src/maplibre.js';
import type { AtlaspecV01Document } from '../src/schema.js';
import type { BenchmarkCondition, EvaluationCheck } from './protocol.js';

export interface OutputRequirements {
  family: AtlaspecV01Document['family'];
  maplibre_layer_types?: readonly string[];
  vega_lite_mark_types?: readonly string[];
  atlaspec_decisions?: readonly string[];
}

export interface OutputEvaluation {
  accepted: boolean;
  checks: EvaluationCheck[];
  diagnostics: string[];
}

export function evaluateGeneratedOutput(
  condition: BenchmarkCondition,
  output: string,
  requirements: OutputRequirements,
): OutputEvaluation {
  switch (condition) {
    case 'atlaspec':
    case 'atlaspec-repair':
      return evaluateAtlaspec(output, requirements);
    case 'direct-maplibre':
    case 'direct-maplibre-repair':
      return evaluateMapLibre(output, requirements);
    case 'direct-vega-lite':
    case 'direct-vega-lite-repair':
      return evaluateVegaLite(output, requirements);
  }
}

function evaluateAtlaspec(
  output: string,
  requirements: OutputRequirements,
): OutputEvaluation {
  let value: unknown;
  try {
    value = parseYaml(output) as unknown;
  } catch (error) {
    return failedParse('atlaspec.parse', error);
  }

  const result = compileMapLibre(value);
  if (!result.ok) {
    const diagnostics = result.diagnostics.map(
      (diagnostic) =>
        `${diagnostic.code} ${diagnostic.path} ${diagnostic.message}`,
    );
    return {
      accepted: false,
      checks: diagnostics.map((detail) =>
        check(`atlaspec.${detail.split(' ', 1)[0]}`, false, detail),
      ),
      diagnostics,
    };
  }

  const document = value as AtlaspecV01Document;
  const styleErrors = validateStyleMin(
    result.style as unknown as StyleSpecification,
  );
  const layerTypes = new Set(
    result.style.layers.map((layer) => String(layer['type'])),
  );
  const decisions = new Set(result.decisions.map((decision) => decision.code));
  const checks = [
    check('atlaspec.compile', true, 'compiled to MapLibre style'),
    check(
      'intent.family',
      document.family === requirements.family,
      `expected=${requirements.family} actual=${document.family}`,
    ),
    check(
      'maplibre.style-valid',
      styleErrors.length === 0,
      styleErrors.length === 0
        ? 'official style validation passed'
        : styleErrors.map((error) => error.message).join('; '),
    ),
  ];
  appendRequiredChecks(
    checks,
    'layer-type',
    requirements.maplibre_layer_types,
    layerTypes,
  );
  appendRequiredChecks(
    checks,
    'decision',
    requirements.atlaspec_decisions,
    decisions,
  );
  return completed(checks);
}

function evaluateMapLibre(
  output: string,
  requirements: OutputRequirements,
): OutputEvaluation {
  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch (error) {
    return failedParse('maplibre.parse', error);
  }

  const errors = validateStyleMin(value as StyleSpecification);
  const layers =
    isRecord(value) && Array.isArray(value['layers']) ? value['layers'] : [];
  const layerTypes = new Set(
    layers
      .filter(isRecord)
      .map((layer) => layer['type'])
      .filter((type): type is string => typeof type === 'string'),
  );
  const checks = [
    check('maplibre.parse', true, 'parsed JSON'),
    check(
      'maplibre.style-valid',
      errors.length === 0,
      errors.length === 0
        ? 'official style validation passed'
        : errors.map((error) => error.message).join('; '),
    ),
  ];
  appendRequiredChecks(
    checks,
    'layer-type',
    requirements.maplibre_layer_types,
    layerTypes,
  );
  return completed(checks);
}

function evaluateVegaLite(
  output: string,
  requirements: OutputRequirements,
): OutputEvaluation {
  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch (error) {
    return failedParse('vega-lite.parse', error);
  }
  if (!isRecord(value)) {
    return completed([
      check('vega-lite.parse', false, 'top-level value must be an object'),
    ]);
  }

  let compiled: ReturnType<typeof compileVegaLite>;
  let compilerWarnings: string[] = [];
  try {
    const captured = captureConsoleWarnings(() => {
      const result = compileVegaLite(value as unknown as TopLevelSpec);
      parseVega(result.spec);
      return result;
    });
    compiled = captured.value;
    compilerWarnings = captured.warnings;
  } catch (error) {
    return completed([
      check('vega-lite.parse', true, 'parsed JSON'),
      check('vega-lite.compile', false, errorMessage(error)),
    ]);
  }

  const markTypes = collectVegaLiteMarks(value);
  const checks = [
    check('vega-lite.parse', true, 'parsed JSON'),
    check('vega-lite.compile', true, 'compiled and parsed as Vega runtime'),
    check(
      'vega-lite.warnings',
      compilerWarnings.length === 0,
      compilerWarnings.length === 0
        ? 'compiler emitted no warnings'
        : compilerWarnings.join('; '),
    ),
  ];
  appendRequiredChecks(
    checks,
    'vega-lite-mark',
    requirements.vega_lite_mark_types,
    markTypes,
  );
  return completed(checks);
}

function captureConsoleWarnings<T>(run: () => T): {
  value: T;
  warnings: string[];
} {
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(errorMessage).join(' '));
  };
  try {
    return { value: run(), warnings };
  } finally {
    console.warn = originalWarn;
  }
}

function collectVegaLiteMarks(value: unknown, result = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectVegaLiteMarks(item, result);
    return result;
  }
  if (!isRecord(value)) return result;

  const mark = value['mark'];
  if (typeof mark === 'string') result.add(mark);
  else if (isRecord(mark) && typeof mark['type'] === 'string') {
    result.add(mark['type']);
  }
  for (const key of ['layer', 'spec', 'concat', 'hconcat', 'vconcat']) {
    if (key in value) collectVegaLiteMarks(value[key], result);
  }
  return result;
}

function appendRequiredChecks(
  checks: EvaluationCheck[],
  prefix: string,
  required: readonly string[] | undefined,
  available: ReadonlySet<string>,
): void {
  for (const value of required ?? []) {
    checks.push(
      check(
        `${prefix}.${value}`,
        available.has(value),
        `available=${[...available].sort().join(',')}`,
      ),
    );
  }
}

function failedParse(code: string, error: unknown): OutputEvaluation {
  return completed([check(code, false, errorMessage(error))]);
}

function completed(checks: EvaluationCheck[]): OutputEvaluation {
  return {
    accepted: checks.every((item) => item.passed),
    checks,
    diagnostics: checks
      .filter((item) => !item.passed)
      .map((item) => `${item.code}: ${item.detail}`),
  };
}

function check(code: string, passed: boolean, detail: string): EvaluationCheck {
  return { code, passed, detail };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
