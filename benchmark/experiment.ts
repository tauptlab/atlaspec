import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { promisify } from 'node:util';

import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Ajv } from 'ajv';

import { evaluateGeneratedOutput } from './evaluate-generated.js';
import {
  BenchmarkConditionSchema,
  ModelIdentitySchema,
  SamplingSchema,
  type AttemptRecord,
  type BenchmarkCondition,
  type GenerationAdapter,
  type GenerationRequest,
  type InputArtifact,
  type RunRecord,
} from './protocol.js';

const Strict = { additionalProperties: false } as const;
const executeFile = promisify(execFile);

const FamilySchema = Type.Union([
  Type.Literal('choropleth'),
  Type.Literal('proportional-symbol'),
  Type.Literal('categorical-point'),
  Type.Literal('heatmap'),
]);

const RequirementsSchema = Type.Object(
  {
    maplibre_layer_types: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
    ),
    vega_lite_mark_types: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
    ),
    atlaspec_decisions: Type.Optional(
      Type.Array(Type.String({ minLength: 1 }), { uniqueItems: true }),
    ),
  },
  Strict,
);

const ConditionConfigSchema = Type.Object(
  {
    condition: BenchmarkConditionSchema,
    prompt: Type.String({ minLength: 1 }),
    requirements: RequirementsSchema,
  },
  Strict,
);

const ExperimentTaskSchema = Type.Object(
  {
    id: Type.String({
      minLength: 1,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    }),
    family: FamilySchema,
    data_files: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
    conditions: Type.Array(ConditionConfigSchema, { minItems: 1 }),
  },
  Strict,
);

export const ExperimentManifestSchema = Type.Object(
  {
    version: Type.Literal('0.1'),
    suite: Type.String({ minLength: 1 }),
    repetitions: Type.Integer({ minimum: 1 }),
    model: ModelIdentitySchema,
    sampling: SamplingSchema,
    tasks: Type.Array(ExperimentTaskSchema, { minItems: 1 }),
  },
  Strict,
);

export type ExperimentManifest = Static<typeof ExperimentManifestSchema>;
export type ExperimentTask = Static<typeof ExperimentTaskSchema>;
export type ConditionConfig = Static<typeof ConditionConfigSchema>;

export interface ConditionSummary {
  condition: BenchmarkCondition;
  attempted: number;
  first_attempt_accepted: number;
  final_accepted: number;
  reliable_map_yield: number;
  final_yield: number;
  repair_iterations: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  charge_usd: number;
  tool_calls: number;
  latency_ms: number;
  cost_per_accepted_map: number | null;
}

export interface ExperimentReport {
  schema_version: '0.1';
  suite: string;
  compiler_commit: string;
  generated_at: string;
  manifest_sha256: string;
  runs: RunRecord[];
  summaries: ConditionSummary[];
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validateManifest = ajv.compile<ExperimentManifest>(
  ExperimentManifestSchema,
);

export async function runExperiment(
  manifestPath: string,
  adapter: GenerationAdapter,
): Promise<ExperimentReport> {
  const absoluteManifest = resolve(manifestPath);
  const manifestRaw = await readFile(absoluteManifest, 'utf8');
  const value = JSON.parse(manifestRaw) as unknown;
  if (!validateManifest(value)) {
    throw new Error(
      `Invalid experiment manifest: ${ajv.errorsText(validateManifest.errors)}`,
    );
  }
  assertUniqueManifestEntries(value);

  const compilerCommit = await readCommit();
  const runs: RunRecord[] = [];
  for (const task of value.tasks) {
    const inputs = await loadInputs(dirname(absoluteManifest), task.data_files);
    for (const condition of task.conditions) {
      for (let repetition = 1; repetition <= value.repetitions; repetition += 1) {
        runs.push(
          await runCondition({
            suite: value.suite,
            task,
            condition,
            repetition,
            model: value.model,
            sampling: value.sampling,
            inputs,
            compilerCommit,
            adapter,
          }),
        );
      }
    }
  }

  return {
    schema_version: '0.1',
    suite: value.suite,
    compiler_commit: compilerCommit,
    generated_at: new Date().toISOString(),
    manifest_sha256: sha256(manifestRaw),
    runs,
    summaries: summarizeRuns(runs),
  };
}

interface RunConditionOptions {
  suite: string;
  task: ExperimentTask;
  condition: ConditionConfig;
  repetition: number;
  model: ExperimentManifest['model'];
  sampling: ExperimentManifest['sampling'];
  inputs: InputArtifact[];
  compilerCommit: string;
  adapter: GenerationAdapter;
}

async function runCondition(options: RunConditionOptions): Promise<RunRecord> {
  const startedAt = new Date().toISOString();
  const attempts: AttemptRecord[] = [];
  const firstRequest = createRequest(options, 1, options.condition.prompt);
  const firstAttempt = await generateAttempt(
    options.adapter,
    firstRequest,
    options.task,
    options.condition,
  );
  attempts.push(firstAttempt);

  if (
    options.condition.condition === 'atlaspec-repair' &&
    firstAttempt.response !== undefined &&
    !firstAttempt.accepted
  ) {
    const diagnostics = firstAttempt.checks
      .filter((item) => !item.passed)
      .map((item) => `${item.code}: ${item.detail}`);
    const repairPrompt = buildRepairPrompt(
      options.condition.prompt,
      firstAttempt.response.output,
      diagnostics,
    );
    const repairRequest = createRequest(
      options,
      2,
      repairPrompt,
      diagnostics,
    );
    attempts.push(
      await generateAttempt(
        options.adapter,
        repairRequest,
        options.task,
        options.condition,
      ),
    );
  }

  const firstAccepted = attempts[0]?.accepted ?? false;
  const finalAccepted = attempts.at(-1)?.accepted ?? false;
  return {
    schema_version: '0.1',
    run_id: runId(
      options.suite,
      options.task.id,
      options.condition.condition,
      options.repetition,
    ),
    compiler_commit: options.compilerCommit,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    first_attempt_accepted: firstAccepted,
    final_accepted: finalAccepted,
    repair_iterations: attempts.length - 1,
    attempts,
  };
}

async function generateAttempt(
  adapter: GenerationAdapter,
  request: GenerationRequest,
  task: ExperimentTask,
  config: ConditionConfig,
): Promise<AttemptRecord> {
  try {
    const response = await adapter.generate(request);
    if (response.request_id !== request.request_id) {
      throw new Error(
        `response request_id mismatch: expected=${request.request_id} actual=${response.request_id}`,
      );
    }
    const evaluation = evaluateGeneratedOutput(
      config.condition,
      response.output,
      { family: task.family, ...config.requirements },
    );
    return {
      request,
      response,
      checks: evaluation.checks,
      accepted: evaluation.accepted,
    };
  } catch (error) {
    return {
      request,
      transport_error: errorMessage(error),
      checks: [
        {
          code: 'transport.generate',
          passed: false,
          detail: errorMessage(error),
        },
      ],
      accepted: false,
    };
  }
}

function createRequest(
  options: RunConditionOptions,
  attempt: 1 | 2,
  prompt: string,
  diagnostics?: string[],
): GenerationRequest {
  const request: GenerationRequest = {
    schema_version: '0.1',
    request_id: `${runId(
      options.suite,
      options.task.id,
      options.condition.condition,
      options.repetition,
    )}/${attempt}`,
    suite: options.suite,
    task_id: options.task.id,
    condition: options.condition.condition,
    repetition: options.repetition,
    attempt,
    model: options.model,
    sampling: options.sampling,
    prompt,
    prompt_sha256: sha256(prompt),
    inputs: options.inputs,
  };
  if (diagnostics !== undefined) request.diagnostics = diagnostics;
  return request;
}

function buildRepairPrompt(
  originalPrompt: string,
  previousOutput: string,
  diagnostics: readonly string[],
): string {
  return [
    originalPrompt,
    '',
    'The previous output failed deterministic validation.',
    'Return a complete replacement artifact and no commentary.',
    '',
    'Diagnostics:',
    ...diagnostics.map((diagnostic) => `- ${diagnostic}`),
    '',
    'Previous output:',
    previousOutput,
  ].join('\n');
}

export function summarizeRuns(runs: readonly RunRecord[]): ConditionSummary[] {
  const conditions: BenchmarkCondition[] = [
    'direct-maplibre',
    'direct-vega-lite',
    'atlaspec',
    'atlaspec-repair',
  ];
  const summaries: ConditionSummary[] = [];
  for (const condition of conditions) {
    const selected = runs.filter(
      (run) => run.attempts[0]?.request.condition === condition,
    );
    if (selected.length === 0) continue;
    const responses = selected.flatMap((run) =>
      run.attempts.flatMap((attempt) =>
        attempt.response === undefined ? [] : [attempt.response],
      ),
    );
    const finalAccepted = selected.filter((run) => run.final_accepted).length;
    const charge = sum(responses.map((response) => response.charge_usd));
    summaries.push({
      condition,
      attempted: selected.length,
      first_attempt_accepted: selected.filter(
        (run) => run.first_attempt_accepted,
      ).length,
      final_accepted: finalAccepted,
      reliable_map_yield:
        selected.filter((run) => run.first_attempt_accepted).length /
        selected.length,
      final_yield: finalAccepted / selected.length,
      repair_iterations: sum(
        selected.map((run) => run.repair_iterations),
      ),
      input_tokens: sum(
        responses.map((response) => response.usage.input_tokens),
      ),
      output_tokens: sum(
        responses.map((response) => response.usage.output_tokens),
      ),
      cached_input_tokens: sum(
        responses.map((response) => response.usage.cached_input_tokens ?? 0),
      ),
      charge_usd: charge,
      tool_calls: sum(responses.map((response) => response.tool_calls)),
      latency_ms: sum(responses.map((response) => response.latency_ms)),
      cost_per_accepted_map:
        finalAccepted === 0 ? null : charge / finalAccepted,
    });
  }
  return summaries;
}

async function loadInputs(
  manifestDirectory: string,
  paths: readonly string[],
): Promise<InputArtifact[]> {
  const inputs: InputArtifact[] = [];
  for (const path of paths) {
    const content = await readFile(resolve(manifestDirectory, path), 'utf8');
    inputs.push({
      path,
      media_type: mediaType(path),
      content,
      sha256: sha256(content),
    });
  }
  return inputs;
}

function assertUniqueManifestEntries(manifest: ExperimentManifest): void {
  const taskIds = new Set<string>();
  for (const task of manifest.tasks) {
    if (taskIds.has(task.id)) throw new Error(`Duplicate task id: ${task.id}`);
    taskIds.add(task.id);
    const conditions = new Set<BenchmarkCondition>();
    for (const config of task.conditions) {
      if (conditions.has(config.condition)) {
        throw new Error(
          `Duplicate condition for task ${task.id}: ${config.condition}`,
        );
      }
      conditions.add(config.condition);
    }
  }
}

function runId(
  suite: string,
  taskId: string,
  condition: BenchmarkCondition,
  repetition: number,
): string {
  return `${suite}/${taskId}/${condition}/${repetition}`;
}

function mediaType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.geojson':
      return 'application/geo+json';
    case '.json':
      return 'application/json';
    case '.csv':
      return 'text/csv';
    default:
      return 'text/plain';
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

async function readCommit(): Promise<string> {
  try {
    const { stdout } = await executeFile('git', ['rev-parse', 'HEAD']);
    return stdout.trim();
  } catch {
    return 'unknown';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
