import { Ajv } from 'ajv';

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

function required(value: string, name: string): string {
  if (value.trim() === '') throw new Error(`${name} must not be empty.`);
  return value;
}
