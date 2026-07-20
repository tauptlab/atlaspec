import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  summarizeRuns,
  type ExperimentManifest,
  type ExperimentReport,
} from '../experiment.js';
import type { RunRecord } from '../protocol.js';
import { analyzeLocalAgent, type LocalAgentAnalysis } from './analysis.js';
import type {
  LocalQualificationJob,
  LocalQualificationLedger,
} from './bundle.js';

export interface LocalJobStatus {
  job_id: string;
  state: 'complete' | 'missing' | 'invalid';
  observed_runs: number;
  diagnostics: string[];
}

export interface LocalAgentResult {
  agent_id: 'codex' | 'claude';
  jobs_complete: number;
  runs: number;
  summaries: ReturnType<typeof summarizeRuns>;
  analysis: LocalAgentAnalysis | null;
}

export interface LocalQualificationStatus {
  schema_version: '0.1';
  benchmark_id: string;
  status: 'complete' | 'incomplete' | 'invalid';
  claim_scope: 'local-coding-agent-within-agent-comparison';
  jobs: { total: number; complete: number; missing: number; invalid: number };
  runs: { expected: number; observed: number };
  job_statuses: LocalJobStatus[];
  agent_results: LocalAgentResult[];
}

interface LoadedJob {
  job: LocalQualificationJob;
  manifestRaw: string;
  manifest: ExperimentManifest;
  report?: LocalJobReport;
  status: LocalJobStatus;
}

export interface LocalJobReport {
  schema_version: '0.1';
  job_id: string;
  experiment: ExperimentReport;
}

export async function inspectLocalQualification(
  bundleDirectory: string,
): Promise<LocalQualificationStatus> {
  const ledger = JSON.parse(
    await readFile(resolve(bundleDirectory, 'local-plan.json'), 'utf8'),
  ) as LocalQualificationLedger;
  const loaded: LoadedJob[] = [];
  for (const job of ledger.jobs) {
    const manifestRaw = await readFile(resolve(bundleDirectory, job.manifest), 'utf8');
    const manifest = JSON.parse(manifestRaw) as ExperimentManifest;
    let report: LocalJobReport | undefined;
    try {
      report = JSON.parse(
        await readFile(resolve(bundleDirectory, job.report), 'utf8'),
      ) as LocalJobReport;
    } catch (error) {
      if (isMissing(error)) {
        loaded.push({ job, manifestRaw, manifest, status: missingStatus(job) });
        continue;
      }
      loaded.push({
        job,
        manifestRaw,
        manifest,
        status: invalidStatus(job, errorMessage(error)),
      });
      continue;
    }
    loaded.push({
      job,
      manifestRaw,
      manifest,
      report,
      status: verifyLocalJob(ledger, job, manifestRaw, manifest, report),
    });
  }

  const jobStatuses = loaded.map((item) => item.status);
  const invalid = jobStatuses.filter((status) => status.state === 'invalid').length;
  const missing = jobStatuses.filter((status) => status.state === 'missing').length;
  const complete = jobStatuses.filter((status) => status.state === 'complete').length;
  const agentResults = ledger.agents.map((agent) => {
    const jobs = loaded.filter(
      (item) => item.job.agent_id === agent.id && item.status.state === 'complete',
    );
    const runs = jobs.flatMap((item) => item.report?.experiment.runs ?? []);
    const summaries = summarizeRuns(runs);
    const report: ExperimentReport = {
      schema_version: '0.1',
      suite: `${ledger.benchmark_id}-${agent.id}`,
      compiler_commit: ledger.compiler_commit,
      generated_at: ledger.generated_at,
      manifest_sha256: ledger.source.manifest_sha256,
      runs,
      summaries,
    };
    return {
      agent_id: agent.id,
      jobs_complete: jobs.length,
      runs: runs.length,
      summaries,
      analysis:
        jobs.length === DIFFICULTY_SHARDS
          ? analyzeLocalAgent(report, ledger.thresholds)
          : null,
    };
  });
  return {
    schema_version: '0.1',
    benchmark_id: ledger.benchmark_id,
    status: invalid > 0 ? 'invalid' : missing > 0 ? 'incomplete' : 'complete',
    claim_scope: ledger.claim_scope,
    jobs: { total: ledger.jobs.length, complete, missing, invalid },
    runs: {
      expected: ledger.totals.expected_runs,
      observed: sum(jobStatuses.map((status) => status.observed_runs)),
    },
    job_statuses: jobStatuses,
    agent_results: agentResults,
  };
}

export function verifyLocalJob(
  ledger: LocalQualificationLedger,
  job: LocalQualificationJob,
  manifestRaw: string,
  manifest: ExperimentManifest,
  report: LocalJobReport,
): LocalJobStatus {
  const diagnostics: string[] = [];
  if (sha256(manifestRaw) !== job.manifest_sha256) diagnostics.push('manifest digest mismatch');
  if (report.job_id !== job.job_id) diagnostics.push('job id mismatch');
  if (report.experiment.compiler_commit !== ledger.compiler_commit) {
    diagnostics.push('compiler commit mismatch');
  }
  if (report.experiment.manifest_sha256 !== job.manifest_sha256) {
    diagnostics.push('report manifest digest mismatch');
  }
  if (report.experiment.suite !== manifest.suite) diagnostics.push('suite mismatch');
  const runs = report.experiment.runs;
  if (runs.length !== job.expected_runs) {
    diagnostics.push(`run count expected=${job.expected_runs} actual=${runs.length}`);
  }
  const agent = ledger.agents.find((candidate) => candidate.id === job.agent_id);
  if (agent === undefined) diagnostics.push('agent missing from ledger');
  const expected = expectedRunIds(manifest);
  const observed = new Set<string>();
  for (const run of runs) {
    if (observed.has(run.run_id)) diagnostics.push(`duplicate run id ${run.run_id}`);
    observed.add(run.run_id);
    if (run.compiler_commit !== ledger.compiler_commit) diagnostics.push(`run commit mismatch ${run.run_id}`);
    for (const attempt of run.attempts) {
      if (!sameModel(attempt.request.model, manifest.model)) {
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
  for (const id of expected) if (!observed.has(id)) diagnostics.push(`missing run id ${id}`);
  for (const id of observed) if (!expected.has(id)) diagnostics.push(`unexpected run id ${id}`);
  return {
    job_id: job.job_id,
    state: diagnostics.length === 0 ? 'complete' : 'invalid',
    observed_runs: runs.length,
    diagnostics,
  };
}

function expectedRunIds(manifest: ExperimentManifest): Set<string> {
  const result = new Set<string>();
  for (const task of manifest.tasks) {
    for (const condition of task.conditions) {
      for (let repetition = 1; repetition <= manifest.repetitions; repetition += 1) {
        result.add(`${manifest.suite}/${task.id}/${condition.condition}/${repetition}`);
      }
    }
  }
  return result;
}

function sameModel(left: ExperimentManifest['model'], right: ExperimentManifest['model']): boolean {
  return left.provider === right.provider && left.model === right.model && left.version === right.version;
}

function missingStatus(job: LocalQualificationJob): LocalJobStatus {
  return { job_id: job.job_id, state: 'missing', observed_runs: 0, diagnostics: ['report missing'] };
}

function invalidStatus(job: LocalQualificationJob, detail: string): LocalJobStatus {
  return { job_id: job.job_id, state: 'invalid', observed_runs: 0, diagnostics: [detail] };
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
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

const DIFFICULTY_SHARDS = 3;
