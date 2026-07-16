import { createHash } from 'node:crypto';
import { posix } from 'node:path';

import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Ajv } from 'ajv';

import type { ExperimentManifest } from '../experiment.js';
import { prepareManifest, rebaseManifestPaths } from '../corpus/prepare.js';

const Strict = { additionalProperties: false } as const;
const StratumSchema = Type.Union([
  Type.Literal('small-or-local'),
  Type.Literal('mid-tier-hosted'),
  Type.Literal('frontier-hosted'),
]);

const OfficialModelSchema = Type.Object(
  {
    id: Type.String({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }),
    stratum: StratumSchema,
    provider: Type.String({ minLength: 1 }),
    model: Type.String({ minLength: 1 }),
    version: Type.String({ minLength: 1 }),
    api_mode: Type.Literal('raw-model-api'),
    cost_observed: Type.Literal(true),
    pricing_source: Type.String({ minLength: 1 }),
  },
  Strict,
);

export const OfficialPlanSchema = Type.Object(
  {
    version: Type.Literal('0.1'),
    benchmark_id: Type.String({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }),
    models: Type.Array(OfficialModelSchema, { minItems: 3 }),
  },
  Strict,
);

export type OfficialPlan = Static<typeof OfficialPlanSchema>;
export type OfficialModel = Static<typeof OfficialModelSchema>;

export interface OfficialJob {
  job_id: string;
  task_id: string;
  model_id: string;
  stratum: OfficialModel['stratum'];
  manifest: string;
  report: string;
  expected_runs: number;
  base_generation_calls: number;
  max_generation_calls: number;
  status: 'pending';
}

export interface OfficialLedger {
  schema_version: '0.1';
  benchmark_id: string;
  generated_at: string;
  compiler_commit: string;
  lockfile_sha256: string;
  holdout_exposed: false;
  source: {
    suite: string;
    manifest_sha256: string;
    task_count: number;
    repetitions: number;
  };
  models: OfficialModel[];
  jobs: OfficialJob[];
  totals: {
    jobs: number;
    expected_runs: number;
    base_generation_calls: number;
    max_generation_calls: number;
  };
}

export interface OfficialBundle {
  ledger: OfficialLedger;
  manifests: ReadonlyMap<string, ExperimentManifest>;
}

export interface BuildOfficialBundleOptions {
  source_manifest_raw: string;
  source_directory: string;
  output_directory: string;
  lockfile_raw: string;
  compiler_commit: string;
  generated_at: string;
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validatePlan = ajv.compile<OfficialPlan>(OfficialPlanSchema);

export function buildOfficialDevelopmentBundle(
  planValue: unknown,
  source: ExperimentManifest,
  options: BuildOfficialBundleOptions,
): OfficialBundle {
  if (!validatePlan(planValue)) {
    throw new Error(`Invalid official plan: ${ajv.errorsText(validatePlan.errors)}`);
  }
  assertOfficialPlan(planValue);
  assertFrozenDevelopmentSource(source);

  const manifests = new Map<string, ExperimentManifest>();
  const jobs: OfficialJob[] = [];
  for (const model of planValue.models) {
    const prepared = prepareManifest(source, model);
    for (const task of prepared.tasks) {
      const relativeManifest = posix.join('manifests', model.id, `${task.id}.json`);
      const relativeReport = posix.join('reports', model.id, `${task.id}.json`);
      const manifestDirectory = posix.dirname(
        posix.join(normalizePath(options.output_directory), relativeManifest),
      );
      const shard = rebaseManifestPaths(
        {
          ...prepared,
          suite: `${prepared.suite}-${model.id}`,
          tasks: [task],
        },
        normalizePath(options.source_directory),
        manifestDirectory,
      );
      manifests.set(relativeManifest, shard);

      const expectedRuns = shard.repetitions * task.conditions.length;
      const repairCalls = task.conditions.some(
        (condition) => condition.condition === 'atlaspec-repair',
      )
        ? shard.repetitions
        : 0;
      jobs.push({
        job_id: `${model.id}/${task.id}`,
        task_id: task.id,
        model_id: model.id,
        stratum: model.stratum,
        manifest: relativeManifest,
        report: relativeReport,
        expected_runs: expectedRuns,
        base_generation_calls: expectedRuns,
        max_generation_calls: expectedRuns + repairCalls,
        status: 'pending',
      });
    }
  }

  return {
    ledger: {
      schema_version: '0.1',
      benchmark_id: planValue.benchmark_id,
      generated_at: options.generated_at,
      compiler_commit: options.compiler_commit,
      lockfile_sha256: sha256(options.lockfile_raw),
      holdout_exposed: false,
      source: {
        suite: source.suite,
        manifest_sha256: sha256(options.source_manifest_raw),
        task_count: source.tasks.length,
        repetitions: source.repetitions,
      },
      models: structuredClone(planValue.models),
      jobs,
      totals: {
        jobs: jobs.length,
        expected_runs: sum(jobs.map((job) => job.expected_runs)),
        base_generation_calls: sum(
          jobs.map((job) => job.base_generation_calls),
        ),
        max_generation_calls: sum(
          jobs.map((job) => job.max_generation_calls),
        ),
      },
    },
    manifests,
  };
}

function assertOfficialPlan(plan: OfficialPlan): void {
  const ids = new Set<string>();
  const strata = new Set<OfficialModel['stratum']>();
  for (const model of plan.models) {
    if (ids.has(model.id)) throw new Error(`Duplicate official model id: ${model.id}`);
    ids.add(model.id);
    strata.add(model.stratum);
    for (const [name, value] of [
      ['provider', model.provider],
      ['model', model.model],
      ['version', model.version],
      ['pricing_source', model.pricing_source],
    ] as const) {
      if (value.startsWith('replace-with-')) {
        throw new Error(`Official model ${model.id} ${name} contains a placeholder.`);
      }
    }
    if (model.provider.endsWith('-cli')) {
      throw new Error(
        `Official model ${model.id} must use a raw model API, not ${model.provider}.`,
      );
    }
  }
  for (const required of [
    'small-or-local',
    'mid-tier-hosted',
    'frontier-hosted',
  ] as const) {
    if (!strata.has(required)) throw new Error(`Missing official model stratum: ${required}`);
  }
}

function assertFrozenDevelopmentSource(source: ExperimentManifest): void {
  if (source.suite !== 'atlasbench-48-development') {
    throw new Error(`Official preparation requires atlasbench-48-development, got ${source.suite}.`);
  }
  if (source.tasks.length !== 36 || source.repetitions !== 5) {
    throw new Error(
      `Frozen development shape mismatch: tasks=${source.tasks.length} repetitions=${source.repetitions}.`,
    );
  }
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/');
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
