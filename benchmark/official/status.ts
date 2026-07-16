import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ExperimentManifest } from '../experiment.js';
import type { RunRecord } from '../protocol.js';
import type { OfficialJob, OfficialLedger } from './plan.js';

export interface OfficialJobStatus {
  job_id: string;
  state: 'complete' | 'missing' | 'invalid';
  observed_runs: number;
  accepted_first_attempt: number;
  final_accepted: number;
  charge_usd: number;
  diagnostics: string[];
}

export interface OfficialBundleStatus {
  schema_version: '0.1';
  benchmark_id: string;
  status: 'complete' | 'incomplete' | 'invalid';
  jobs: {
    total: number;
    complete: number;
    missing: number;
    invalid: number;
  };
  runs: {
    expected: number;
    observed: number;
    accepted_first_attempt: number;
    final_accepted: number;
  };
  observed_charge_usd: number;
  job_statuses: OfficialJobStatus[];
}

export async function inspectOfficialBundle(
  bundleDirectory: string,
): Promise<OfficialBundleStatus> {
  const ledger = JSON.parse(
    await readFile(resolve(bundleDirectory, 'official-plan.json'), 'utf8'),
  ) as OfficialLedger;
  const statuses: OfficialJobStatus[] = [];
  for (const job of ledger.jobs) {
    const manifestRaw = await readFile(
      resolve(bundleDirectory, job.manifest),
      'utf8',
    );
    let reportValue: unknown;
    try {
      reportValue = JSON.parse(
        await readFile(resolve(bundleDirectory, job.report), 'utf8'),
      ) as unknown;
    } catch (error) {
      if (isMissing(error)) {
        statuses.push(missingStatus(job));
        continue;
      }
      statuses.push(invalidStatus(job, errorMessage(error)));
      continue;
    }
    statuses.push(verifyOfficialJob(ledger, job, manifestRaw, reportValue));
  }
  return summarizeOfficialStatuses(ledger, statuses);
}

export function verifyOfficialJob(
  ledger: OfficialLedger,
  job: OfficialJob,
  manifestRaw: string,
  reportValue: unknown,
): OfficialJobStatus {
  const diagnostics: string[] = [];
  let manifest: ExperimentManifest;
  try {
    manifest = JSON.parse(manifestRaw) as ExperimentManifest;
  } catch (error) {
    return invalidStatus(job, `manifest JSON: ${errorMessage(error)}`);
  }
  if (sha256(manifestRaw) !== job.manifest_sha256) {
    diagnostics.push('shard manifest digest does not match the official ledger');
  }
  if (!isRecord(reportValue) || !isRecord(reportValue['experiment'])) {
    return invalidStatus(job, 'report must contain an experiment object');
  }
  const experiment = reportValue['experiment'];
  if (experiment['compiler_commit'] !== ledger.compiler_commit) {
    diagnostics.push(
      `compiler commit expected=${ledger.compiler_commit} actual=${String(experiment['compiler_commit'])}`,
    );
  }
  if (experiment['manifest_sha256'] !== sha256(manifestRaw)) {
    diagnostics.push('report manifest digest does not match the shard manifest');
  }
  if (experiment['suite'] !== manifest.suite) {
    diagnostics.push(
      `suite expected=${manifest.suite} actual=${String(experiment['suite'])}`,
    );
  }
  const runs = Array.isArray(experiment['runs'])
    ? experiment['runs'].filter(isRunRecord)
    : [];
  if (runs.length !== job.expected_runs) {
    diagnostics.push(`run count expected=${job.expected_runs} actual=${runs.length}`);
  }

  const expectedIds = expectedRunIds(manifest);
  const observedIds = new Set<string>();
  let charge = 0;
  for (const run of runs) {
    if (observedIds.has(run.run_id)) diagnostics.push(`duplicate run id ${run.run_id}`);
    observedIds.add(run.run_id);
    if (run.compiler_commit !== ledger.compiler_commit) {
      diagnostics.push(`run ${run.run_id} compiler commit mismatch`);
    }
    for (const attempt of run.attempts) {
      if (
        attempt.request.model.provider !== manifest.model.provider ||
        attempt.request.model.model !== manifest.model.model ||
        attempt.request.model.version !== manifest.model.version
      ) {
        diagnostics.push(`run ${run.run_id} request model mismatch`);
      }
      if (attempt.response !== undefined) {
        charge += attempt.response.charge_usd;
        const model = ledger.models.find((candidate) => candidate.id === job.model_id);
        if (model === undefined) {
          diagnostics.push(`official model is missing from ledger: ${job.model_id}`);
        } else {
          if (!attempt.response.cost_observed) {
            diagnostics.push(`run ${run.run_id} did not observe monetary cost`);
          }
          if (attempt.response.pricing.source !== model.pricing_source) {
            diagnostics.push(`run ${run.run_id} pricing source mismatch`);
          }
          if (
            attempt.response.resolved_model.provider !== model.provider ||
            attempt.response.resolved_model.version !== model.version
          ) {
            diagnostics.push(`run ${run.run_id} resolved model mismatch`);
          }
        }
      }
    }
  }
  for (const expected of expectedIds) {
    if (!observedIds.has(expected)) diagnostics.push(`missing run id ${expected}`);
  }
  for (const observed of observedIds) {
    if (!expectedIds.has(observed)) diagnostics.push(`unexpected run id ${observed}`);
  }

  return {
    job_id: job.job_id,
    state: diagnostics.length === 0 ? 'complete' : 'invalid',
    observed_runs: runs.length,
    accepted_first_attempt: runs.filter((run) => run.first_attempt_accepted).length,
    final_accepted: runs.filter((run) => run.final_accepted).length,
    charge_usd: charge,
    diagnostics,
  };
}

export function summarizeOfficialStatuses(
  ledger: OfficialLedger,
  statuses: readonly OfficialJobStatus[],
): OfficialBundleStatus {
  const complete = statuses.filter((status) => status.state === 'complete').length;
  const missing = statuses.filter((status) => status.state === 'missing').length;
  const invalid = statuses.filter((status) => status.state === 'invalid').length;
  return {
    schema_version: '0.1',
    benchmark_id: ledger.benchmark_id,
    status: invalid > 0 ? 'invalid' : missing > 0 ? 'incomplete' : 'complete',
    jobs: { total: ledger.jobs.length, complete, missing, invalid },
    runs: {
      expected: ledger.totals.expected_runs,
      observed: sum(statuses.map((status) => status.observed_runs)),
      accepted_first_attempt: sum(
        statuses.map((status) => status.accepted_first_attempt),
      ),
      final_accepted: sum(statuses.map((status) => status.final_accepted)),
    },
    observed_charge_usd: sum(statuses.map((status) => status.charge_usd)),
    job_statuses: [...statuses],
  };
}

function expectedRunIds(manifest: ExperimentManifest): Set<string> {
  const ids = new Set<string>();
  for (const task of manifest.tasks) {
    for (const condition of task.conditions) {
      for (let repetition = 1; repetition <= manifest.repetitions; repetition += 1) {
        ids.add(`${manifest.suite}/${task.id}/${condition.condition}/${repetition}`);
      }
    }
  }
  return ids;
}

function missingStatus(job: OfficialJob): OfficialJobStatus {
  return {
    job_id: job.job_id,
    state: 'missing',
    observed_runs: 0,
    accepted_first_attempt: 0,
    final_accepted: 0,
    charge_usd: 0,
    diagnostics: ['report file is missing'],
  };
}

function invalidStatus(job: OfficialJob, detail: string): OfficialJobStatus {
  return {
    job_id: job.job_id,
    state: 'invalid',
    observed_runs: 0,
    accepted_first_attempt: 0,
    final_accepted: 0,
    charge_usd: 0,
    diagnostics: [detail],
  };
}

function isRunRecord(value: unknown): value is RunRecord {
  return (
    isRecord(value) &&
    typeof value['run_id'] === 'string' &&
    typeof value['compiler_commit'] === 'string' &&
    typeof value['first_attempt_accepted'] === 'boolean' &&
    typeof value['final_accepted'] === 'boolean' &&
    Array.isArray(value['attempts'])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
