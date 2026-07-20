import { createHash } from 'node:crypto';
import { posix } from 'node:path';

import type { ExperimentManifest } from '../experiment.js';
import type { ModelIdentity } from '../protocol.js';
import {
  DIFFICULTIES,
  FAMILIES,
  VARIANTS,
  type CorpusMatrix,
  type Difficulty,
} from '../corpus/corpus.js';
import { rebaseManifestPaths } from '../corpus/prepare.js';

export interface LocalAgentIdentity {
  id: 'codex' | 'claude';
  cli_version: string;
  model: ModelIdentity;
  cost_observed: boolean;
}

export interface LocalQualificationJob {
  job_id: string;
  agent_id: LocalAgentIdentity['id'];
  difficulty: Difficulty;
  manifest: string;
  manifest_sha256: string;
  report: string;
  expected_runs: number;
  base_generation_calls: number;
  max_generation_calls: number;
  status: 'pending';
}

export interface LocalQualificationLedger {
  schema_version: '0.1';
  benchmark_id: 'atlasbench-local-qualification-v1';
  generated_at: string;
  compiler_commit: string;
  lockfile_sha256: string;
  claim_scope: 'local-coding-agent-within-agent-comparison';
  holdout_exposed: false;
  cross_agent_absolute_token_comparison: 'prohibited';
  qualification: {
    task_count: 12;
    repetitions: 2;
    selection: 'next-development-variant-after-rotated-holdout';
    execution_order: 'balanced';
  };
  thresholds: {
    relative_failure_reduction: 0.3;
    output_token_reduction: 0.25;
    low_baseline_failure_rate: 0.1;
    yield_noninferiority_margin: 0.03;
    confidence_level: 0.95;
    bootstrap_iterations: 10000;
    bootstrap_seed: 20260720;
  };
  source: {
    suite: string;
    manifest_sha256: string;
    matrix_sha256: string;
  };
  agents: LocalAgentIdentity[];
  jobs: LocalQualificationJob[];
  totals: {
    jobs: number;
    expected_runs: number;
    base_generation_calls: number;
    max_generation_calls: number;
  };
}

export interface LocalQualificationBundle {
  ledger: LocalQualificationLedger;
  manifests: ReadonlyMap<string, ExperimentManifest>;
}

export interface BuildLocalQualificationOptions {
  agents: readonly LocalAgentIdentity[];
  source_manifest_raw: string;
  matrix_raw: string;
  source_directory: string;
  output_directory: string;
  lockfile_raw: string;
  compiler_commit: string;
  generated_at: string;
}

export function buildLocalQualificationBundle(
  source: ExperimentManifest,
  matrix: CorpusMatrix,
  options: BuildLocalQualificationOptions,
): LocalQualificationBundle {
  assertSource(source, matrix);
  assertAgents(options.agents);
  const selectedIds = qualificationTaskIds(matrix);
  const selected = new Map(
    source.tasks
      .filter((task) => selectedIds.has(task.id))
      .map((task) => [task.id, task]),
  );
  if (selected.size !== 12) {
    throw new Error(`Qualification selection expected 12 development tasks, got ${selected.size}.`);
  }

  const manifests = new Map<string, ExperimentManifest>();
  const jobs: LocalQualificationJob[] = [];
  for (const agent of options.agents) {
    for (const difficulty of DIFFICULTIES) {
      const tasks = FAMILIES.map((family) => {
        const id = [...selectedIds].find(
          (candidate) => candidate.startsWith(`${family}-${difficulty}-`),
        );
        const task = id === undefined ? undefined : selected.get(id);
        if (task === undefined) throw new Error(`Missing selected task for ${family}/${difficulty}.`);
        return task;
      });
      const relativeManifest = posix.join('manifests', agent.id, `${difficulty}.json`);
      const relativeReport = posix.join('reports', agent.id, `${difficulty}.json`);
      const manifestDirectory = posix.dirname(
        posix.join(normalizePath(options.output_directory), relativeManifest),
      );
      const manifest = rebaseManifestPaths(
        {
          ...structuredClone(source),
          suite: `atlasbench-local-qualification-${agent.id}-${difficulty}`,
          repetitions: 2,
          execution_order: 'balanced',
          model: structuredClone(agent.model),
          tasks,
        },
        normalizePath(options.source_directory),
        manifestDirectory,
      );
      const serialized = serializeLocalManifest(manifest);
      manifests.set(relativeManifest, manifest);
      const expectedRuns = sum(tasks.map((task) => task.conditions.length)) * 2;
      const repairCalls = tasks.length * 2;
      jobs.push({
        job_id: `${agent.id}/${difficulty}`,
        agent_id: agent.id,
        difficulty,
        manifest: relativeManifest,
        manifest_sha256: sha256(serialized),
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
      benchmark_id: 'atlasbench-local-qualification-v1',
      generated_at: options.generated_at,
      compiler_commit: options.compiler_commit,
      lockfile_sha256: sha256(options.lockfile_raw),
      claim_scope: 'local-coding-agent-within-agent-comparison',
      holdout_exposed: false,
      cross_agent_absolute_token_comparison: 'prohibited',
      qualification: {
        task_count: 12,
        repetitions: 2,
        selection: 'next-development-variant-after-rotated-holdout',
        execution_order: 'balanced',
      },
      thresholds: {
        relative_failure_reduction: 0.3,
        output_token_reduction: 0.25,
        low_baseline_failure_rate: 0.1,
        yield_noninferiority_margin: 0.03,
        confidence_level: 0.95,
        bootstrap_iterations: 10000,
        bootstrap_seed: 20260720,
      },
      source: {
        suite: source.suite,
        manifest_sha256: sha256(options.source_manifest_raw),
        matrix_sha256: sha256(options.matrix_raw),
      },
      agents: options.agents.map((agent) => structuredClone(agent)),
      jobs,
      totals: {
        jobs: jobs.length,
        expected_runs: sum(jobs.map((job) => job.expected_runs)),
        base_generation_calls: sum(jobs.map((job) => job.base_generation_calls)),
        max_generation_calls: sum(jobs.map((job) => job.max_generation_calls)),
      },
    },
    manifests,
  };
}

export function qualificationTaskIds(matrix: CorpusMatrix): Set<string> {
  const ids = new Set<string>();
  for (const [familyIndex, family] of FAMILIES.entries()) {
    for (const [difficultyIndex, difficulty] of DIFFICULTIES.entries()) {
      const selectedVariant = VARIANTS[(familyIndex + difficultyIndex + 1) % VARIANTS.length]!;
      const task = matrix.tasks.find(
        (candidate) =>
          candidate.family === family &&
          candidate.difficulty === difficulty &&
          candidate.variant === selectedVariant,
      );
      if (task === undefined || task.split !== 'development') {
        throw new Error(`Qualification task is not development-visible: ${family}/${difficulty}/${selectedVariant}.`);
      }
      ids.add(task.id);
    }
  }
  return ids;
}

export function serializeLocalManifest(manifest: ExperimentManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function assertSource(source: ExperimentManifest, matrix: CorpusMatrix): void {
  if (source.suite !== 'atlasbench-48-development' || source.tasks.length !== 36) {
    throw new Error('Local qualification requires the frozen 36-task development manifest.');
  }
  if (matrix.corpus !== 'atlasbench-48' || matrix.tasks.length !== 48) {
    throw new Error('Local qualification requires the frozen atlasbench-48 matrix.');
  }
}

function assertAgents(agents: readonly LocalAgentIdentity[]): void {
  if (agents.length !== 2 || new Set(agents.map((agent) => agent.id)).size !== 2) {
    throw new Error('Local qualification requires exactly Codex and Claude agents.');
  }
  for (const required of ['codex', 'claude'] as const) {
    if (!agents.some((agent) => agent.id === required)) {
      throw new Error(`Missing local qualification agent: ${required}.`);
    }
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
