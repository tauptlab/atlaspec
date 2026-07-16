import { Ajv } from 'ajv';
import { isAbsolute, relative, resolve } from 'node:path';

import {
  ExperimentManifestSchema,
  type ExperimentManifest,
} from '../experiment.js';

export interface PrepareOptions {
  provider: string;
  model: string;
  version: string;
  acknowledge_holdout_exposure?: boolean;
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validateManifest = ajv.compile<ExperimentManifest>(
  ExperimentManifestSchema,
);

export function prepareManifest(
  value: unknown,
  options: PrepareOptions,
): ExperimentManifest {
  if (!validateManifest(value)) {
    throw new Error(
      `Invalid source manifest: ${ajv.errorsText(validateManifest.errors)}`,
    );
  }
  if (
    value.suite.includes('holdout') &&
    options.acknowledge_holdout_exposure !== true
  ) {
    throw new Error(
      'Preparing a holdout manifest requires --acknowledge-holdout-exposure.',
    );
  }
  const provider = required(options.provider, 'provider');
  const model = required(options.model, 'model');
  const version = required(options.version, 'version');
  if ([provider, model, version].some((item) => item.startsWith('replace-with-'))) {
    throw new Error('Prepared model identity must not contain placeholders.');
  }

  return {
    ...structuredClone(value),
    model: { provider, model, version },
  };
}

export function rebaseManifestPaths(
  manifest: ExperimentManifest,
  sourceDirectory: string,
  outputDirectory: string,
): ExperimentManifest {
  const rebased = structuredClone(manifest);
  for (const task of rebased.tasks) {
    task.data_files = task.data_files.map((path) =>
      rebasePath(path, sourceDirectory, outputDirectory),
    );
    for (const condition of task.conditions) {
      if (condition.reference_files !== undefined) {
        condition.reference_files = condition.reference_files.map((path) =>
          rebasePath(path, sourceDirectory, outputDirectory),
        );
      }
    }
  }
  return rebased;
}

function rebasePath(
  path: string,
  sourceDirectory: string,
  outputDirectory: string,
): string {
  if (isAbsolute(path)) return path;
  const rebased = relative(outputDirectory, resolve(sourceDirectory, path));
  return rebased.replaceAll('\\', '/');
}

function required(value: string, name: string): string {
  if (value.trim() === '') throw new Error(`${name} must not be empty.`);
  return value;
}
