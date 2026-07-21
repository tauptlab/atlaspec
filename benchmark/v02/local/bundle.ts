import { createHash } from 'node:crypto';

import type { ModelIdentity } from '../../protocol.js';
import {
  COMPOSITION_ARCHETYPES,
  V02_DIFFICULTIES,
  V02_VARIANTS,
  type V02CorpusMatrix,
  type V02Difficulty,
} from '../corpus.js';
import type { V02EvaluationManifest } from '../manifest.js';

export interface V02LocalAgentIdentity {
  id: 'codex' | 'claude';
  cli_version: string;
  model: ModelIdentity;
  cost_observed: boolean;
}

export interface V02LocalThresholds {
  relative_failure_reduction: 0.3;
  uncached_token_reduction: 0.25;
  output_token_reduction: 0.25;
  low_baseline_failure_rate: 0.1;
  yield_noninferiority_margin: 0.03;
  edit_survival: 0.95;
  portability: 0.95;
  capability_fail_closed: 1;
  confidence_level: 0.95;
  bootstrap_iterations: 10000;
  bootstrap_seed: 2803528194;
}

export interface V02LocalJob {
  job_id: string;
  agent_id: V02LocalAgentIdentity['id'];
  difficulty: V02Difficulty;
  task_ids: string[];
  report: string;
  expected_runs: number;
  base_generation_calls: number;
  max_generation_calls: number;
  status: 'pending';
}

export interface V02LocalQualificationLedger {
  schema_version: '0.2';
  benchmark_id:
    | 'atlasbench-v02-local-qualification-v1'
    | 'atlasbench-v02-local-qualification-v2';
  supersedes?: 'atlasbench-v02-local-qualification-v1';
  generated_at: string;
  compiler_commit: string;
  lockfile_sha256: string;
  claim_scope: 'local-coding-agent-within-agent-comparison';
  holdout_exposed: false;
  cross_agent_absolute_token_comparison: 'prohibited';
  qualification: {
    revision?: 'reference-hardening-v2';
    task_count: 12;
    repetitions: 2;
    selection: 'third-development-variant-after-rotated-holdout';
    execution_order: 'balanced';
  };
  thresholds: V02LocalThresholds;
  source: {
    manifest: 'benchmark/v02/development.manifest.json';
    manifest_sha256: string;
    matrix: 'benchmark/v02/matrix.json';
    matrix_sha256: string;
    reference?: 'benchmark/references/atlaspec-v02.md';
    reference_sha256?: string;
  };
  agents: V02LocalAgentIdentity[];
  jobs: V02LocalJob[];
  totals: {
    jobs: 6;
    expected_runs: number;
    base_generation_calls: number;
    max_generation_calls: number;
  };
}

export interface BuildV02LocalBundleOptions {
  agents: readonly V02LocalAgentIdentity[];
  source_manifest_raw: string;
  matrix_raw: string;
  reference_raw: string;
  lockfile_raw: string;
  compiler_commit: string;
  generated_at: string;
}

export function buildV02LocalQualificationLedger(
  manifest: V02EvaluationManifest,
  matrix: V02CorpusMatrix,
  options: BuildV02LocalBundleOptions,
): V02LocalQualificationLedger {
  assertSource(manifest, matrix);
  assertAgents(options.agents);
  const selectedIds = qualificationTaskIds(matrix);
  const selected = new Map(
    manifest.tasks
      .filter((task) => selectedIds.has(task.id))
      .map((task) => [task.id, task]),
  );
  if (selected.size !== 12) {
    throw new Error(`v0.2 qualification expected 12 development tasks, got ${selected.size}.`);
  }

  const jobs: V02LocalJob[] = [];
  for (const agent of options.agents) {
    for (const difficulty of V02_DIFFICULTIES) {
      const taskIds = COMPOSITION_ARCHETYPES.map((archetype) => {
        const task = matrix.tasks.find(
          (candidate) =>
            candidate.archetype === archetype &&
            candidate.difficulty === difficulty &&
            selectedIds.has(candidate.id),
        );
        if (task === undefined || !selected.has(task.id)) {
          throw new Error(`Missing qualification task for ${archetype}/${difficulty}.`);
        }
        return task.id;
      });
      const tasks = taskIds.map((id) => selected.get(id)!);
      const expectedRuns =
        tasks.reduce((total, task) => total + task.conditions.length, 0) * 2;
      const editCalls = tasks.length * 3 * 2;
      const repairCalls = tasks.length * 2;
      jobs.push({
        job_id: `${agent.id}/${difficulty}`,
        agent_id: agent.id,
        difficulty,
        task_ids: taskIds,
        report: `reports/${agent.id}/${difficulty}.json`,
        expected_runs: expectedRuns,
        base_generation_calls: expectedRuns,
        max_generation_calls: expectedRuns + editCalls + repairCalls,
        status: 'pending',
      });
    }
  }

  return {
    schema_version: '0.2',
    benchmark_id: 'atlasbench-v02-local-qualification-v2',
    supersedes: 'atlasbench-v02-local-qualification-v1',
    generated_at: options.generated_at,
    compiler_commit: options.compiler_commit,
    lockfile_sha256: sha256(options.lockfile_raw),
    claim_scope: 'local-coding-agent-within-agent-comparison',
    holdout_exposed: false,
    cross_agent_absolute_token_comparison: 'prohibited',
    qualification: {
      revision: 'reference-hardening-v2',
      task_count: 12,
      repetitions: 2,
      selection: 'third-development-variant-after-rotated-holdout',
      execution_order: 'balanced',
    },
    thresholds: {
      relative_failure_reduction: 0.3,
      uncached_token_reduction: 0.25,
      output_token_reduction: 0.25,
      low_baseline_failure_rate: 0.1,
      yield_noninferiority_margin: 0.03,
      edit_survival: 0.95,
      portability: 0.95,
      capability_fail_closed: 1,
      confidence_level: 0.95,
      bootstrap_iterations: 10000,
      bootstrap_seed: 2803528194,
    },
    source: {
      manifest: 'benchmark/v02/development.manifest.json',
      manifest_sha256: sha256(options.source_manifest_raw),
      matrix: 'benchmark/v02/matrix.json',
      matrix_sha256: sha256(options.matrix_raw),
      reference: 'benchmark/references/atlaspec-v02.md',
      reference_sha256: sha256(options.reference_raw),
    },
    agents: options.agents.map((agent) => structuredClone(agent)),
    jobs,
    totals: {
      jobs: 6,
      expected_runs: sum(jobs.map((job) => job.expected_runs)),
      base_generation_calls: sum(jobs.map((job) => job.base_generation_calls)),
      max_generation_calls: sum(jobs.map((job) => job.max_generation_calls)),
    },
  };
}

export function qualificationTaskIds(matrix: V02CorpusMatrix): Set<string> {
  const ids = new Set<string>();
  for (const [archetypeIndex, archetype] of COMPOSITION_ARCHETYPES.entries()) {
    for (const [difficultyIndex, difficulty] of V02_DIFFICULTIES.entries()) {
      const holdoutIndex = (archetypeIndex + difficultyIndex) % V02_VARIANTS.length;
      const variant = V02_VARIANTS[(holdoutIndex + 3) % V02_VARIANTS.length]!;
      const task = matrix.tasks.find(
        (candidate) =>
          candidate.archetype === archetype &&
          candidate.difficulty === difficulty &&
          candidate.variant === variant,
      );
      if (task === undefined || task.split !== 'development') {
        throw new Error(`Qualification task is not development-visible: ${archetype}/${difficulty}/${variant}.`);
      }
      ids.add(task.id);
    }
  }
  return ids;
}

export function serializeV02LocalLedger(
  ledger: V02LocalQualificationLedger,
): string {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}

function assertSource(
  manifest: V02EvaluationManifest,
  matrix: V02CorpusMatrix,
): void {
  if (
    manifest.version !== '0.2' ||
    manifest.suite !== 'atlasbench-v02-48-development' ||
    manifest.tasks.length !== 36
  ) {
    throw new Error('v0.2 local qualification requires the frozen development manifest.');
  }
  if (matrix.corpus !== 'atlasbench-v02-48' || matrix.tasks.length !== 48) {
    throw new Error('v0.2 local qualification requires the frozen 48-task matrix.');
  }
}

function assertAgents(agents: readonly V02LocalAgentIdentity[]): void {
  if (agents.length !== 2 || new Set(agents.map((agent) => agent.id)).size !== 2) {
    throw new Error('v0.2 local qualification requires exactly Codex and Claude.');
  }
  for (const required of ['codex', 'claude'] as const) {
    if (!agents.some((agent) => agent.id === required)) {
      throw new Error(`Missing v0.2 local agent: ${required}.`);
    }
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
