import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import type { V02ExperimentReport } from '../experiment.js';
import type { V02EvaluationManifest } from '../manifest.js';
import type {
  V02LocalJob,
  V02LocalQualificationLedger,
} from './bundle.js';
import {
  analyzeV02LocalAgent,
  type V02AgentAnalysis,
} from './analysis.js';

const executeFile = promisify(execFile);

export interface V02LocalJobReport {
  schema_version: '0.2';
  job_id: string;
  experiment: V02ExperimentReport;
}

export interface V02LocalJobStatus {
  job_id: string;
  state: 'complete' | 'partial' | 'missing' | 'invalid';
  observed_runs: number;
  diagnostics: string[];
}

export interface V02LocalQualificationStatus {
  schema_version: '0.2';
  benchmark_id: string;
  status: 'complete' | 'incomplete' | 'invalid';
  holdout_exposed: false;
  jobs: {
    total: number;
    complete: number;
    partial: number;
    missing: number;
    invalid: number;
  };
  runs: { expected: number; observed: number };
  source_diagnostics: string[];
  job_statuses: V02LocalJobStatus[];
  agent_results: Array<{
    agent_id: 'codex' | 'claude';
    jobs_complete: number;
    runs: number;
    analysis: V02AgentAnalysis | null;
  }>;
}

export async function inspectV02LocalQualification(
  bundleDirectory: string,
): Promise<V02LocalQualificationStatus> {
  const ledger = JSON.parse(
    await readFile(resolve(bundleDirectory, 'v02-local-plan.json'), 'utf8'),
  ) as V02LocalQualificationLedger;
  const manifestRaw = await readFile(resolve(ledger.source.manifest), 'utf8');
  const matrixRaw = await readFile(resolve(ledger.source.matrix), 'utf8');
  const lockfileRaw = await readFile(resolve('package-lock.json'), 'utf8');
  const sourceDiagnostics: string[] = [];
  try {
    const { stdout } = await executeFile('git', ['rev-parse', 'HEAD']);
    if (stdout.trim() !== ledger.compiler_commit) {
      sourceDiagnostics.push('compiler commit drift from plan');
    }
  } catch (error) {
    sourceDiagnostics.push(`cannot read compiler commit: ${errorMessage(error)}`);
  }
  if (sha256(manifestRaw) !== ledger.source.manifest_sha256) {
    sourceDiagnostics.push('development manifest digest mismatch');
  }
  if (sha256(matrixRaw) !== ledger.source.matrix_sha256) {
    sourceDiagnostics.push('matrix digest mismatch');
  }
  if (sha256(lockfileRaw) !== ledger.lockfile_sha256) {
    sourceDiagnostics.push('lockfile digest mismatch');
  }
  const manifest = JSON.parse(manifestRaw) as V02EvaluationManifest;
  const statuses: V02LocalJobStatus[] = [];
  const reports = new Map<string, V02LocalJobReport>();
  for (const job of ledger.jobs) {
    try {
      const report = JSON.parse(
        await readFile(resolve(bundleDirectory, job.report), 'utf8'),
      ) as V02LocalJobReport;
      const status = verifyV02LocalJob(ledger, job, manifest, report);
      statuses.push(status);
      if (status.state === 'complete') reports.set(job.job_id, report);
    } catch (error) {
      if (!isMissing(error)) {
        statuses.push(invalidStatus(job, errorMessage(error)));
        continue;
      }
      try {
        const checkpoint = JSON.parse(
          await readFile(
            resolve(bundleDirectory, checkpointReportPath(job.report)),
            'utf8',
          ),
        ) as V02LocalJobReport;
        const status = verifyV02LocalJob(ledger, job, manifest, checkpoint, {
          allowPartial: true,
        });
        statuses.push(
          status.state === 'complete'
            ? { ...status, state: 'partial' }
            : status,
        );
      } catch (checkpointError) {
        statuses.push(
          isMissing(checkpointError)
            ? missingStatus(job)
            : invalidStatus(job, errorMessage(checkpointError)),
        );
      }
    }
  }
  const complete = statuses.filter((status) => status.state === 'complete').length;
  const partial = statuses.filter((status) => status.state === 'partial').length;
  const missing = statuses.filter((status) => status.state === 'missing').length;
  const invalid = statuses.filter((status) => status.state === 'invalid').length;
  const agentResults = ledger.agents.map((agent) => {
    const jobs = ledger.jobs.filter(
      (job) => job.agent_id === agent.id && reports.has(job.job_id),
    );
    const runs = jobs.flatMap(
      (job) => reports.get(job.job_id)?.experiment.runs ?? [],
    );
    return {
      agent_id: agent.id,
      jobs_complete: jobs.length,
      runs: runs.length,
      analysis:
        jobs.length === 3
          ? analyzeV02LocalAgent(runs, manifest, ledger.thresholds)
          : null,
    };
  });
  return {
    schema_version: '0.2',
    benchmark_id: ledger.benchmark_id,
    status:
      sourceDiagnostics.length > 0 || invalid > 0
        ? 'invalid'
        : missing > 0 || partial > 0
          ? 'incomplete'
          : 'complete',
    holdout_exposed: false,
    jobs: { total: statuses.length, complete, partial, missing, invalid },
    runs: {
      expected: ledger.totals.expected_runs,
      observed: sum(statuses.map((status) => status.observed_runs)),
    },
    source_diagnostics: sourceDiagnostics,
    job_statuses: statuses,
    agent_results: agentResults,
  };
}

export function verifyV02LocalJob(
  ledger: V02LocalQualificationLedger,
  job: V02LocalJob,
  manifest: V02EvaluationManifest,
  report: V02LocalJobReport,
  options: { allowPartial?: boolean } = {},
): V02LocalJobStatus {
  const diagnostics: string[] = [];
  if (report.schema_version !== '0.2') diagnostics.push('report schema mismatch');
  if (report.job_id !== job.job_id) diagnostics.push('job id mismatch');
  const experiment = report.experiment;
  if (experiment.compiler_commit !== ledger.compiler_commit) {
    diagnostics.push('compiler commit mismatch');
  }
  if (experiment.manifest_sha256 !== ledger.source.manifest_sha256) {
    diagnostics.push('report manifest digest mismatch');
  }
  if (experiment.execution_order !== 'balanced') {
    diagnostics.push('execution order mismatch');
  }
  const agent = ledger.agents.find((candidate) => candidate.id === job.agent_id);
  if (agent === undefined) {
    diagnostics.push('agent missing from ledger');
  } else if (!sameModel(experiment.model, agent.model)) {
    diagnostics.push('experiment model mismatch');
  }
  if (options.allowPartial !== true && experiment.runs.length !== job.expected_runs) {
    diagnostics.push(
      `run count expected=${job.expected_runs} actual=${experiment.runs.length}`,
    );
  }

  const expected = expectedRunIds(manifest, job, ledger.qualification.repetitions);
  const observed = new Set<string>();
  for (const run of experiment.runs) {
    if (observed.has(run.run_id)) diagnostics.push(`duplicate run id ${run.run_id}`);
    observed.add(run.run_id);
    if (run.compiler_commit !== ledger.compiler_commit) {
      diagnostics.push(`run commit mismatch ${run.run_id}`);
    }
    for (const attempt of run.attempts) {
      if (agent !== undefined && !sameModel(attempt.request.model, agent.model)) {
        diagnostics.push(`request model mismatch ${run.run_id}`);
      }
      if (attempt.response !== undefined && agent !== undefined) {
        if (
          attempt.response.resolved_model.provider !== agent.model.provider ||
          attempt.response.resolved_model.version !== agent.model.version
        ) {
          diagnostics.push(`resolved model mismatch ${run.run_id}`);
        }
        if (attempt.response.cost_observed !== agent.cost_observed) {
          diagnostics.push(`cost observation mismatch ${run.run_id}`);
        }
      }
    }
  }
  if (options.allowPartial !== true) {
    for (const id of expected) if (!observed.has(id)) diagnostics.push(`missing run id ${id}`);
  }
  for (const id of observed) if (!expected.has(id)) diagnostics.push(`unexpected run id ${id}`);
  return {
    job_id: job.job_id,
    state: diagnostics.length === 0 ? 'complete' : 'invalid',
    observed_runs: experiment.runs.length,
    diagnostics,
  };
}

export function checkpointReportPath(reportPath: string): string {
  return reportPath.endsWith('.json')
    ? `${reportPath.slice(0, -5)}.checkpoint.json`
    : `${reportPath}.checkpoint.json`;
}

function expectedRunIds(
  manifest: V02EvaluationManifest,
  job: V02LocalJob,
  repetitions: number,
): Set<string> {
  const result = new Set<string>();
  for (const task of manifest.tasks.filter((candidate) => job.task_ids.includes(candidate.id))) {
    for (const condition of task.conditions) {
      for (let repetition = 1; repetition <= repetitions; repetition += 1) {
        result.add(`${manifest.suite}/${task.id}/${condition}/${repetition}`);
      }
    }
  }
  return result;
}

function sameModel(
  left: V02ExperimentReport['model'],
  right: V02ExperimentReport['model'],
): boolean {
  return (
    left.provider === right.provider &&
    left.model === right.model &&
    left.version === right.version
  );
}

function missingStatus(job: V02LocalJob): V02LocalJobStatus {
  return {
    job_id: job.job_id,
    state: 'missing',
    observed_runs: 0,
    diagnostics: ['report missing'],
  };
}

function invalidStatus(job: V02LocalJob, detail: string): V02LocalJobStatus {
  return {
    job_id: job.job_id,
    state: 'invalid',
    observed_runs: 0,
    diagnostics: [detail],
  };
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
