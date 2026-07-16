import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  validateStyleMin,
  type StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import { parse } from 'yaml';

import { compileMapLibre } from '../src/maplibre.js';
import type { AtlaspecDocument } from '../src/schema.js';
import type {
  BenchmarkCheck,
  BenchmarkTask,
  BenchmarkTaskResult,
} from './manifest.js';

export async function evaluateTask(
  manifestDirectory: string,
  task: BenchmarkTask,
): Promise<BenchmarkTaskResult> {
  const artifactPath = resolve(manifestDirectory, task.artifact);
  let value: unknown;

  try {
    value = parse(await readFile(artifactPath, 'utf8')) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      task_id: task.id,
      accepted: false,
      checks: [check('artifact.load', false, detail)],
    };
  }

  const result = compileMapLibre(value);
  if (!result.ok) {
    return {
      task_id: task.id,
      accepted: false,
      checks: result.diagnostics.map((diagnostic) =>
        check(
          `diagnostic.${diagnostic.code}`,
          false,
          `${diagnostic.path} ${diagnostic.message}`,
        ),
      ),
    };
  }

  const document = value as AtlaspecDocument;
  const layerTypes = new Set(
    result.style.layers.map((layer) => String(layer['type'])),
  );
  const decisionCodes = new Set(result.decisions.map((decision) => decision.code));
  const styleErrors = validateStyleMin(
    result.style as unknown as StyleSpecification,
  );
  const checks: BenchmarkCheck[] = [
    check(
      'intent.family',
      document.family === task.family,
      `expected=${task.family} actual=${document.family}`,
    ),
    check(
      'maplibre.style-valid',
      styleErrors.length === 0,
      styleErrors.length === 0
        ? 'official style validation passed'
        : styleErrors.map((error) => error.message).join('; '),
    ),
    check(
      'diagnostics.no-errors',
      result.diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
      `${result.diagnostics.length} diagnostics emitted`,
    ),
  ];

  for (const layerType of task.required_layer_types) {
    checks.push(
      check(
        `layer-type.${layerType}`,
        layerTypes.has(layerType),
        `available=${[...layerTypes].sort().join(',')}`,
      ),
    );
  }

  for (const decision of task.required_decisions) {
    checks.push(
      check(
        `decision.${decision}`,
        decisionCodes.has(decision),
        `available=${[...decisionCodes].sort().join(',')}`,
      ),
    );
  }

  return {
    task_id: task.id,
    accepted: checks.every((item) => item.passed),
    checks,
  };
}

function check(code: string, passed: boolean, detail: string): BenchmarkCheck {
  return { code, passed, detail };
}
