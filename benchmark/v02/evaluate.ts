import {
  validateStyleMin,
  type StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import { parse as parseVega } from 'vega';
import { compile as compileVegaLiteSpec } from 'vega-lite';
import type { TopLevelSpec } from 'vega-lite';
import { parse as parseYaml } from 'yaml';

import { compileMapLibre, type MapLibreStyle } from '../../src/maplibre.js';
import { compileVegaLite, type VegaLiteSpec } from '../../src/vega-lite.js';
import type { V02Condition, V02ManifestTask } from './manifest.js';
import {
  validateDirectMapLibreSemantics,
  validateDirectVegaLiteSemantics,
} from './semantic.js';

export interface V02EvaluationCheck {
  code: string;
  passed: boolean;
  detail: string;
}

export interface V02OutputEvaluation {
  accepted: boolean;
  checks: V02EvaluationCheck[];
}

export function evaluateV02Output(
  condition: V02Condition,
  output: string,
  task: V02ManifestTask,
): V02OutputEvaluation {
  switch (condition) {
    case 'direct-maplibre':
    case 'direct-maplibre-repair':
      return evaluateDirectMapLibre(output, task);
    case 'direct-vega-lite':
    case 'direct-vega-lite-repair':
      return evaluateDirectVegaLite(output, task);
    case 'atlaspec-maplibre':
    case 'atlaspec-maplibre-repair':
    case 'atlaspec-repair':
      return evaluateAtlaspecMapLibre(output, task);
    case 'atlaspec-vega-lite':
    case 'atlaspec-vega-lite-repair':
      return evaluateAtlaspecVegaLite(output, task);
    case 'vega-capability-negative':
      return evaluateCapabilityNegative(output);
  }
}

function evaluateDirectMapLibre(
  output: string,
  task: V02ManifestTask,
): V02OutputEvaluation {
  const value = parseJson(output);
  if (!value.ok) return completed([check('maplibre.parse', false, value.error)]);
  const style = value.value as unknown as MapLibreStyle;
  const errors = validateStyleMin(style as unknown as StyleSpecification);
  const semantic = validateDirectMapLibreSemantics(style, task);
  return completed([
    check('maplibre.parse', true, 'parsed JSON'),
    check(
      'maplibre.style-valid',
      errors.length === 0,
      errors.length === 0
        ? 'official style validation passed'
        : errors.map((error) => error.message).join('; '),
    ),
    ...semantic.diagnostics.map((detail) =>
      check(`semantic.${detail.split(' ', 1)[0]}`, false, detail),
    ),
    check(
      'semantic.maplibre-contract',
      semantic.accepted,
      semantic.accepted ? 'locked semantic contract passed' : 'semantic contract failed',
    ),
  ]);
}

function evaluateDirectVegaLite(
  output: string,
  task: V02ManifestTask,
): V02OutputEvaluation {
  const value = parseJson(output);
  if (!value.ok) return completed([check('vega-lite.parse', false, value.error)]);
  const spec = value.value as VegaLiteSpec;
  const warnings: string[] = [];
  let compileError: string | undefined;
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));
  try {
    parseVega(compileVegaLiteSpec(spec as unknown as TopLevelSpec).spec);
  } catch (error) {
    compileError = errorMessage(error);
  } finally {
    console.warn = originalWarn;
  }
  const semantic = validateDirectVegaLiteSemantics(spec, task);
  return completed([
    check('vega-lite.parse', true, 'parsed JSON'),
    check('vega-lite.compile', compileError === undefined, compileError ?? 'compiled and parsed'),
    check(
      'vega-lite.warnings',
      warnings.length === 0,
      warnings.length === 0 ? 'no warnings' : warnings.join('; '),
    ),
    ...semantic.diagnostics.map((detail) =>
      check(`semantic.${detail.split(' ', 1)[0]}`, false, detail),
    ),
    check(
      'semantic.vega-lite-contract',
      semantic.accepted,
      semantic.accepted ? 'locked semantic contract passed' : 'semantic contract failed',
    ),
  ]);
}

function evaluateAtlaspecMapLibre(
  output: string,
  task: V02ManifestTask,
): V02OutputEvaluation {
  const parsed = parseAtlaspec(output);
  if (!parsed.ok) return completed([check('atlaspec.parse', false, parsed.error)]);
  const result = compileMapLibre(parsed.value);
  if (!result.ok) {
    return completed(
      result.diagnostics.map((diagnostic) =>
        check(`atlaspec.${diagnostic.code}`, false, `${diagnostic.path} ${diagnostic.message}`),
      ),
    );
  }
  const semantic = validateDirectMapLibreSemantics(result.style, task);
  const errors = validateStyleMin(result.style as unknown as StyleSpecification);
  return completed([
    check('atlaspec.maplibre-compile', true, 'compiled Atlaspec to MapLibre'),
    check('maplibre.style-valid', errors.length === 0, `${errors.length} style errors`),
    check(
      'semantic.maplibre-contract',
      semantic.accepted,
      semantic.diagnostics.join('; ') || 'locked semantic contract passed',
    ),
  ]);
}

function evaluateAtlaspecVegaLite(
  output: string,
  task: V02ManifestTask,
): V02OutputEvaluation {
  const parsed = parseAtlaspec(output);
  if (!parsed.ok) return completed([check('atlaspec.parse', false, parsed.error)]);
  const result = compileVegaLite(parsed.value);
  if (!result.ok) {
    return completed(
      result.diagnostics.map((diagnostic) =>
        check(`atlaspec.${diagnostic.code}`, false, `${diagnostic.path} ${diagnostic.message}`),
      ),
    );
  }
  const semantic = validateDirectVegaLiteSemantics(result.spec, task);
  return completed([
    check('atlaspec.vega-lite-compile', true, 'compiled Atlaspec to Vega-Lite'),
    check(
      'semantic.vega-lite-contract',
      semantic.accepted,
      semantic.diagnostics.join('; ') || 'locked semantic contract passed',
    ),
  ]);
}

function evaluateCapabilityNegative(output: string): V02OutputEvaluation {
  const parsed = parseAtlaspec(output);
  if (!parsed.ok) return completed([check('atlaspec.parse', false, parsed.error)]);
  const result = compileVegaLite(parsed.value);
  const diagnostics = result.ok ? [] : result.diagnostics;
  const failClosed =
    !result.ok &&
    diagnostics.length > 0 &&
    diagnostics.every((diagnostic) =>
      diagnostic.code.startsWith('vega-lite.unsupported-'),
    );
  return completed([
    check(
      'vega-lite.capability-fail-closed',
      failClosed,
      result.ok
        ? 'unsupported intent compiled unexpectedly'
        : diagnostics.map((diagnostic) => diagnostic.code).join(', '),
    ),
  ]);
}

function parseJson(output: string):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string } {
  try {
    const value = JSON.parse(output) as unknown;
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? { ok: true, value: value as Record<string, unknown> }
      : { ok: false, error: 'top-level value must be an object' };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

function parseAtlaspec(output: string):
  | { ok: true; value: unknown }
  | { ok: false; error: string } {
  try {
    return { ok: true, value: parseYaml(output) as unknown };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

function check(code: string, passed: boolean, detail: string): V02EvaluationCheck {
  return { code, passed, detail };
}

function completed(checks: V02EvaluationCheck[]): V02OutputEvaluation {
  return { accepted: checks.length > 0 && checks.every((item) => item.passed), checks };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
