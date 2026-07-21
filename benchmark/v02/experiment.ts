import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { promisify } from 'node:util';

import { parse as parseYaml } from 'yaml';

import { compileMapLibre, type MapLibreStyle } from '../../src/maplibre.js';
import type {
  GenerationAdapter,
  GenerationRequest,
  GenerationResponse,
  InputArtifact,
  ModelIdentity,
  Sampling,
} from '../protocol.js';
import { evaluateV02Output, type V02EvaluationCheck } from './evaluate.js';
import {
  validateV02Manifest,
  type V02Condition,
  type V02EvaluationManifest,
  type V02ManifestTask,
} from './manifest.js';
import {
  compareUntargetedLayers,
  extractMapLibreSemantics,
} from './semantic.js';

const executeFile = promisify(execFile);
const EDIT_CONDITIONS = new Set<V02Condition>([
  'direct-maplibre',
  'atlaspec-maplibre',
  'atlaspec-repair',
]);

export interface V02ExperimentOptions {
  model: ModelIdentity;
  sampling: Sampling;
  repetitions?: number;
  task_ids?: readonly string[];
  conditions?: readonly V02Condition[];
  on_run_complete?: (
    run: V02RunRecord,
    completedRuns: number,
  ) => void | Promise<void>;
}

export interface V02AttemptRecord {
  stage: 'initial' | 'repair' | 'edit';
  request: GenerationRequest;
  response?: GenerationResponse;
  transport_error?: string;
  checks: V02EvaluationCheck[];
  accepted: boolean;
}

export interface V02EditRecord {
  attempted: boolean;
  accepted: boolean;
  target_layer: string;
  checks: V02EvaluationCheck[];
  changed_output_bytes: number | null;
}

export interface V02RunRecord {
  schema_version: '0.2';
  run_id: string;
  task_id: string;
  condition: V02Condition;
  repetition: number;
  compiler_commit: string;
  started_at: string;
  completed_at: string;
  first_attempt_accepted: boolean;
  final_accepted: boolean;
  repair_iterations: number;
  attempts: V02AttemptRecord[];
  edit: V02EditRecord | null;
}

export interface V02ConditionSummary {
  condition: V02Condition;
  attempted: number;
  first_attempt_accepted: number;
  final_accepted: number;
  edit_attempted: number;
  edit_accepted: number;
  generation_input_tokens: number;
  generation_output_tokens: number;
  edit_input_tokens: number;
  edit_output_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  charge_usd: number;
  latency_ms: number;
}

export interface V02ExperimentReport {
  schema_version: '0.2';
  suite: string;
  compiler_commit: string;
  generated_at: string;
  manifest_sha256: string;
  model: ModelIdentity;
  sampling: Sampling;
  execution_order: 'balanced';
  runs: V02RunRecord[];
  summaries: V02ConditionSummary[];
}

export async function runV02Experiment(
  manifestPath: string,
  adapter: GenerationAdapter,
  options: V02ExperimentOptions,
): Promise<V02ExperimentReport> {
  const absoluteManifest = resolve(manifestPath);
  const manifestRaw = await readFile(absoluteManifest, 'utf8');
  const manifest = parseManifest(manifestRaw);
  const diagnostics = validateV02Manifest(manifest);
  if (diagnostics.length > 0) {
    throw new Error(`Invalid v0.2 manifest: ${diagnostics.join('; ')}`);
  }
  const tasks = selectTasks(manifest.tasks, options.task_ids);
  const compilerCommit = await readCommit();
  const runs: V02RunRecord[] = [];
  const repetitions = options.repetitions ?? manifest.repetitions;
  if (!Number.isInteger(repetitions) || repetitions < 1) {
    throw new Error('repetitions must be a positive integer.');
  }

  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    for (const { task, manifestIndex } of tasks) {
      const dataInputs = await loadInputs(dirname(absoluteManifest), task.data_files, 'data');
      const conditions = task.conditions.filter(
        (condition) =>
          options.conditions === undefined || options.conditions.includes(condition),
      );
      if (conditions.length === 0) {
        throw new Error(`No selected conditions are declared for task ${task.id}.`);
      }
      const offset = (manifestIndex + repetition - 1) % conditions.length;
      for (let conditionIndex = 0; conditionIndex < conditions.length; conditionIndex += 1) {
        const condition = conditions[(conditionIndex + offset) % conditions.length]!;
        const reference = await referenceInput(dirname(absoluteManifest), condition);
        const run = await runCondition(
            manifest.suite,
            task,
            condition,
            repetition,
            options,
            [...dataInputs, reference],
            compilerCommit,
            adapter,
          );
        runs.push(run);
        if (options.on_run_complete !== undefined) {
          await options.on_run_complete(run, runs.length);
        }
      }
    }
  }

  return {
    schema_version: '0.2',
    suite: manifest.suite,
    compiler_commit: compilerCommit,
    generated_at: new Date().toISOString(),
    manifest_sha256: sha256(manifestRaw),
    model: structuredClone(options.model),
    sampling: structuredClone(options.sampling),
    execution_order: 'balanced',
    runs,
    summaries: summarizeV02Runs(runs),
  };
}

async function runCondition(
  suite: string,
  task: V02ManifestTask,
  condition: V02Condition,
  repetition: number,
  options: V02ExperimentOptions,
  inputs: InputArtifact[],
  compilerCommit: string,
  adapter: GenerationAdapter,
): Promise<V02RunRecord> {
  const startedAt = new Date().toISOString();
  const attempts: V02AttemptRecord[] = [];
  const initial = requestFor(
    suite,
    task,
    condition,
    repetition,
    1,
    options,
    inputs,
    conditionPrompt(task, condition),
  );
  attempts.push(await generateAttempt('initial', adapter, initial, task, condition));

  if (
    condition === 'atlaspec-repair' &&
    attempts[0]?.response !== undefined &&
    !attempts[0].accepted
  ) {
    const failed = attempts[0];
    const failedResponse = failed.response!;
    const diagnostics = failed.checks
      .filter((item) => !item.passed)
      .map((item) => `${item.code}: ${item.detail}`);
    const request = requestFor(
      suite,
      task,
      condition,
      repetition,
      2,
      options,
      inputs,
      repairPrompt(task, condition, failedResponse.output, diagnostics),
      diagnostics,
    );
    attempts.push(await generateAttempt('repair', adapter, request, task, condition));
  }

  const acceptedAttempt = [...attempts].reverse().find((attempt) => attempt.accepted);
  let edit: V02EditRecord | null = null;
  if (EDIT_CONDITIONS.has(condition) && acceptedAttempt?.response !== undefined) {
    const editAttemptNumber = attempts.length === 1 ? 2 : 3;
    const request = requestFor(
      suite,
      task,
      condition,
      repetition,
      editAttemptNumber,
      options,
      inputs,
      editPrompt(task, condition, acceptedAttempt.response.output),
    );
    const editAttempt = await generateEditAttempt(
      adapter,
      request,
      task,
      condition,
      acceptedAttempt.response.output,
    );
    attempts.push(editAttempt);
    edit = {
      attempted: true,
      accepted: editAttempt.accepted,
      target_layer: task.edit_target,
      checks: editAttempt.checks,
      changed_output_bytes:
        editAttempt.response === undefined
          ? null
          : byteDifference(acceptedAttempt.response.output, editAttempt.response.output),
    };
  }

  const generationAttempts = attempts.filter((attempt) => attempt.stage !== 'edit');
  return {
    schema_version: '0.2',
    run_id: `${suite}/${task.id}/${condition}/${repetition}`,
    task_id: task.id,
    condition,
    repetition,
    compiler_commit: compilerCommit,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    first_attempt_accepted: generationAttempts[0]?.accepted ?? false,
    final_accepted: generationAttempts.at(-1)?.accepted ?? false,
    repair_iterations: generationAttempts.filter((attempt) => attempt.stage === 'repair').length,
    attempts,
    edit,
  };
}

async function generateAttempt(
  stage: 'initial' | 'repair',
  adapter: GenerationAdapter,
  request: GenerationRequest,
  task: V02ManifestTask,
  condition: V02Condition,
): Promise<V02AttemptRecord> {
  try {
    const response = await adapter.generate(request);
    assertResponseIdentity(request, response);
    const evaluation = evaluateV02Output(condition, response.output, task);
    return { stage, request, response, checks: evaluation.checks, accepted: evaluation.accepted };
  } catch (error) {
    return transportFailure(stage, request, error);
  }
}

async function generateEditAttempt(
  adapter: GenerationAdapter,
  request: GenerationRequest,
  task: V02ManifestTask,
  condition: V02Condition,
  beforeOutput: string,
): Promise<V02AttemptRecord> {
  try {
    const response = await adapter.generate(request);
    assertResponseIdentity(request, response);
    const editedTask = structuredClone(task);
    editedTask.layers.find((layer) => layer.id === task.edit_target)!.missing_data = 'hide';
    const evaluation = evaluateV02Output(condition, response.output, editedTask);
    const survival = evaluateEditSurvival(condition, beforeOutput, response.output, task);
    const checks = [...evaluation.checks, ...survival];
    return {
      stage: 'edit',
      request,
      response,
      checks,
      accepted: checks.length > 0 && checks.every((check) => check.passed),
    };
  } catch (error) {
    return transportFailure('edit', request, error);
  }
}

function evaluateEditSurvival(
  condition: V02Condition,
  beforeOutput: string,
  afterOutput: string,
  task: V02ManifestTask,
): V02EvaluationCheck[] {
  if (condition === 'direct-maplibre') {
    try {
      const before = JSON.parse(beforeOutput) as MapLibreStyle;
      const after = JSON.parse(afterOutput) as MapLibreStyle;
      const target = task.layers.find((layer) => layer.id === task.edit_target)!;
      const keep = (layer: Record<string, unknown>): boolean =>
        !(
          layer['source'] === target.source &&
          target.maplibre_types.includes(String(layer['type']))
        );
      const beforeLayers = before.layers.filter(keep);
      const afterLayers = after.layers.filter(keep);
      const passed = JSON.stringify(beforeLayers) === JSON.stringify(afterLayers);
      return [editCheck('edit.maplibre-unrelated-byte-stable', passed, passed ? 'unchanged' : 'unrelated renderer layers changed')];
    } catch (error) {
      return [editCheck('edit.maplibre-unrelated-byte-stable', false, errorMessage(error))];
    }
  }

  try {
    const beforeDocument = parseYaml(beforeOutput) as Record<string, unknown>;
    const afterDocument = parseYaml(afterOutput) as Record<string, unknown>;
    const beforeLayers = atlaspecUntargetedLayers(beforeDocument, task.edit_target);
    const afterLayers = atlaspecUntargetedLayers(afterDocument, task.edit_target);
    const structural = JSON.stringify(beforeLayers) === JSON.stringify(afterLayers);
    const beforeCompiled = compileMapLibre(beforeDocument);
    const afterCompiled = compileMapLibre(afterDocument);
    let semanticPassed = false;
    let semanticDetail = 'compiler failed';
    if (beforeCompiled.ok && afterCompiled.ok) {
      const beforeSemantic = extractMapLibreSemantics(beforeCompiled.style);
      const afterSemantic = extractMapLibreSemantics(afterCompiled.style);
      if (beforeSemantic.ok && afterSemantic.ok) {
        const comparison = compareUntargetedLayers(
          beforeSemantic.record,
          afterSemantic.record,
          task.edit_target,
        );
        semanticPassed = comparison.equal;
        semanticDetail = comparison.differences.join('; ') || 'unchanged';
      }
    }
    return [
      editCheck(
        'edit.atlaspec-unrelated-structural-stable',
        structural,
        structural ? 'unchanged' : 'unrelated Atlaspec layers changed',
      ),
      editCheck('edit.semantic-unrelated-stable', semanticPassed, semanticDetail),
    ];
  } catch (error) {
    return [editCheck('edit.atlaspec-unrelated-structural-stable', false, errorMessage(error))];
  }
}

function requestFor(
  suite: string,
  task: V02ManifestTask,
  condition: V02Condition,
  repetition: number,
  attempt: 1 | 2 | 3,
  options: V02ExperimentOptions,
  inputs: InputArtifact[],
  prompt: string,
  diagnostics?: string[],
): GenerationRequest {
  const request: GenerationRequest = {
    schema_version: '0.1',
    request_id: `${suite}/${task.id}/${condition}/${repetition}/${attempt}`,
    suite,
    task_id: task.id,
    condition,
    repetition,
    attempt,
    model: structuredClone(options.model),
    sampling: structuredClone(options.sampling),
    prompt,
    prompt_sha256: sha256(prompt),
    inputs: structuredClone(inputs),
  };
  if (diagnostics !== undefined) request.diagnostics = diagnostics;
  return request;
}

function conditionPrompt(task: V02ManifestTask, condition: V02Condition): string {
  const output =
    condition === 'direct-maplibre'
      ? 'Return only a complete MapLibre Style Specification v8 JSON document.'
      : condition === 'direct-vega-lite'
        ? 'Return only a complete Vega-Lite v6 JSON document.'
        : 'Return only a complete Atlaspec 0.2 YAML document.';
  return `${task.prompt} Use every supplied GeoJSON input by its exact path. ${output}`;
}

function repairPrompt(
  task: V02ManifestTask,
  condition: V02Condition,
  previousOutput: string,
  diagnostics: readonly string[],
): string {
  return [
    conditionPrompt(task, condition),
    'The previous output failed deterministic validation. Return a complete replacement artifact.',
    'Diagnostics:',
    ...diagnostics.map((diagnostic) => `- ${diagnostic}`),
    'Previous output:',
    previousOutput,
  ].join('\n\n');
}

function editPrompt(
  task: V02ManifestTask,
  condition: V02Condition,
  previousOutput: string,
): string {
  return [
    conditionPrompt(task, condition),
    task.edit_prompt,
    'Return the complete edited replacement artifact. Preserve every unrelated layer byte-for-byte where the output format permits.',
    'Previous accepted artifact:',
    previousOutput,
  ].join('\n\n');
}

export function summarizeV02Runs(runs: readonly V02RunRecord[]): V02ConditionSummary[] {
  return [...new Set(runs.map((run) => run.condition))].map((condition) => {
    const selected = runs.filter((run) => run.condition === condition);
    const responses = selected.flatMap((run) =>
      run.attempts.flatMap((attempt) => (attempt.response === undefined ? [] : [attempt.response])),
    );
    const generationResponses = selected.flatMap((run) =>
      run.attempts.flatMap((attempt) =>
        attempt.stage === 'edit' || attempt.response === undefined ? [] : [attempt.response],
      ),
    );
    const editResponses = selected.flatMap((run) =>
      run.attempts.flatMap((attempt) =>
        attempt.stage !== 'edit' || attempt.response === undefined ? [] : [attempt.response],
      ),
    );
    return {
      condition,
      attempted: selected.length,
      first_attempt_accepted: selected.filter((run) => run.first_attempt_accepted).length,
      final_accepted: selected.filter((run) => run.final_accepted).length,
      edit_attempted: selected.filter((run) => run.edit?.attempted).length,
      edit_accepted: selected.filter((run) => run.edit?.accepted).length,
      generation_input_tokens: sum(
        generationResponses.map((response) => response.usage.input_tokens),
      ),
      generation_output_tokens: sum(
        generationResponses.map((response) => response.usage.output_tokens),
      ),
      edit_input_tokens: sum(editResponses.map((response) => response.usage.input_tokens)),
      edit_output_tokens: sum(editResponses.map((response) => response.usage.output_tokens)),
      input_tokens: sum(responses.map((response) => response.usage.input_tokens)),
      output_tokens: sum(responses.map((response) => response.usage.output_tokens)),
      cached_input_tokens: sum(responses.map((response) => response.usage.cached_input_tokens ?? 0)),
      charge_usd: sum(responses.map((response) => response.charge_usd)),
      latency_ms: sum(responses.map((response) => response.latency_ms)),
    };
  });
}

function parseManifest(raw: string): V02EvaluationManifest {
  const value = JSON.parse(raw) as Partial<V02EvaluationManifest>;
  if (value.version !== '0.2' || typeof value.suite !== 'string' || !Array.isArray(value.tasks)) {
    throw new Error('Manifest must be an AtlasBench 0.2 evaluation manifest.');
  }
  return value as V02EvaluationManifest;
}

function selectTasks(
  tasks: V02ManifestTask[],
  requested?: readonly string[],
): Array<{ task: V02ManifestTask; manifestIndex: number }> {
  const selected = tasks
    .map((task, manifestIndex) => ({ task, manifestIndex }))
    .filter(({ task }) => requested === undefined || requested.includes(task.id));
  if (requested === undefined) return selected;
  const missing = requested.filter(
    (id) => !selected.some(({ task }) => task.id === id),
  );
  if (missing.length > 0) throw new Error(`Unknown task IDs: ${missing.join(', ')}`);
  return selected;
}

async function referenceInput(
  manifestDirectory: string,
  condition: V02Condition,
): Promise<InputArtifact> {
  const name =
    condition === 'direct-maplibre'
      ? 'maplibre.md'
      : condition === 'direct-vega-lite'
        ? 'vega-lite.md'
        : 'atlaspec-v02.md';
  return (await loadInputs(manifestDirectory, [`../references/${name}`], 'reference'))[0]!;
}

async function loadInputs(
  manifestDirectory: string,
  paths: readonly string[],
  role: InputArtifact['role'],
): Promise<InputArtifact[]> {
  return await Promise.all(
    paths.map(async (path) => {
      const content = await readFile(resolve(manifestDirectory, path), 'utf8');
      return { path, role, media_type: mediaType(path), content, sha256: sha256(content) };
    }),
  );
}

function atlaspecUntargetedLayers(document: Record<string, unknown>, target: string): unknown[] {
  return Array.isArray(document['layers'])
    ? document['layers'].filter(
        (layer) =>
          typeof layer !== 'object' ||
          layer === null ||
          Array.isArray(layer) ||
          (layer as Record<string, unknown>)['id'] !== target,
      )
    : [];
}

function transportFailure(
  stage: V02AttemptRecord['stage'],
  request: GenerationRequest,
  error: unknown,
): V02AttemptRecord {
  const detail = errorMessage(error);
  return {
    stage,
    request,
    transport_error: detail,
    checks: [editCheck('transport.generate', false, detail)],
    accepted: false,
  };
}

function assertResponseIdentity(
  request: GenerationRequest,
  response: GenerationResponse,
): void {
  if (response.request_id !== request.request_id) {
    throw new Error(
      `response request_id mismatch: expected=${request.request_id} actual=${response.request_id}`,
    );
  }
  if (
    response.resolved_model.provider !== request.model.provider ||
    response.resolved_model.version !== request.model.version
  ) {
    throw new Error(
      `resolved model mismatch: requested=${request.model.provider}/${request.model.version} ` +
        `actual=${response.resolved_model.provider}/${response.resolved_model.version}`,
    );
  }
}

function editCheck(code: string, passed: boolean, detail: string): V02EvaluationCheck {
  return { code, passed, detail };
}

function mediaType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.geojson': return 'application/geo+json';
    case '.json': return 'application/json';
    case '.md': return 'text/markdown';
    default: return 'text/plain';
  }
}

function byteDifference(before: string, after: string): number {
  const beforeBytes = Buffer.from(before);
  const afterBytes = Buffer.from(after);
  const common = Math.min(beforeBytes.length, afterBytes.length);
  let changed = Math.abs(beforeBytes.length - afterBytes.length);
  for (let index = 0; index < common; index += 1) {
    if (beforeBytes[index] !== afterBytes[index]) changed += 1;
  }
  return changed;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

async function readCommit(): Promise<string> {
  try {
    return (await executeFile('git', ['rev-parse', 'HEAD'])).stdout.trim();
  } catch {
    return 'unknown';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
