import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { ExperimentManifest } from '../experiment.js';
import type { OfficialJob, OfficialLedger } from './plan.js';
import { summarizeOfficialStatuses, verifyOfficialJob } from './status.js';

describe('official benchmark report verification', () => {
  it('accepts a report only when provenance and the exact run set match', () => {
    const manifest = shardManifest();
    const raw = `${JSON.stringify(manifest, null, 2)}\n`;
    const ledger = fixtureLedger();
    const job = ledger.jobs[0]!;
    const runs = [1, 2].map((repetition) => run(manifest, repetition));
    const report = {
      experiment: {
        suite: manifest.suite,
        compiler_commit: ledger.compiler_commit,
        manifest_sha256: sha256(raw),
        runs,
      },
    };

    const status = verifyOfficialJob(ledger, job, raw, report);
    expect(status).toEqual(
      expect.objectContaining({
        state: 'complete',
        observed_runs: 2,
        accepted_first_attempt: 2,
        charge_usd: 0.02,
      }),
    );
  });

  it('fails closed for a changed manifest or incomplete run set', () => {
    const manifest = shardManifest();
    const raw = `${JSON.stringify(manifest, null, 2)}\n`;
    const ledger = fixtureLedger();
    const report = {
      experiment: {
        suite: manifest.suite,
        compiler_commit: ledger.compiler_commit,
        manifest_sha256: 'wrong',
        runs: [run(manifest, 1)],
      },
    };
    const status = verifyOfficialJob(ledger, ledger.jobs[0]!, raw, report);
    expect(status.state).toBe('invalid');
    expect(status.diagnostics.join('\n')).toContain('manifest digest');
    expect(status.diagnostics.join('\n')).toContain('missing run id');
  });

  it('keeps missing jobs distinct from invalid evidence', () => {
    const ledger = fixtureLedger();
    const result = summarizeOfficialStatuses(ledger, [
      {
        job_id: 'model/task',
        state: 'missing',
        observed_runs: 0,
        accepted_first_attempt: 0,
        final_accepted: 0,
        charge_usd: 0,
        diagnostics: ['report file is missing'],
      },
    ]);
    expect(result.status).toBe('incomplete');
    expect(result.jobs).toEqual({ total: 1, complete: 0, missing: 1, invalid: 0 });
  });
});

function shardManifest(): ExperimentManifest {
  return {
    version: '0.1',
    suite: 'atlasbench-48-development-model',
    repetitions: 2,
    model: { provider: 'provider', model: 'model', version: 'snapshot' },
    sampling: { temperature: 0, max_output_tokens: 100 },
    tasks: [
      {
        id: 'task',
        family: 'choropleth',
        data_files: ['data.geojson'],
        conditions: [
          {
            condition: 'atlaspec',
            prompt: 'Return Atlaspec.',
            requirements: {},
          },
        ],
      },
    ],
  };
}

function fixtureLedger(): OfficialLedger {
  const job: OfficialJob = {
    job_id: 'model/task',
    task_id: 'task',
    model_id: 'model',
    stratum: 'small-or-local',
    manifest: 'manifest.json',
    report: 'report.json',
    expected_runs: 2,
    base_generation_calls: 2,
    max_generation_calls: 2,
    status: 'pending',
  };
  return {
    schema_version: '0.1',
    benchmark_id: 'benchmark',
    generated_at: '2026-07-16T00:00:00Z',
    compiler_commit: 'commit',
    lockfile_sha256: 'lock',
    holdout_exposed: false,
    source: {
      suite: 'atlasbench-48-development',
      manifest_sha256: 'source',
      task_count: 1,
      repetitions: 2,
    },
    models: [],
    jobs: [job],
    totals: {
      jobs: 1,
      expected_runs: 2,
      base_generation_calls: 2,
      max_generation_calls: 2,
    },
  };
}

function run(manifest: ExperimentManifest, repetition: number) {
  const request = {
    schema_version: '0.1' as const,
    request_id: `${manifest.suite}/task/atlaspec/${repetition}/1`,
    suite: manifest.suite,
    task_id: 'task',
    condition: 'atlaspec' as const,
    repetition,
    attempt: 1 as const,
    model: manifest.model,
    sampling: manifest.sampling,
    prompt: 'Return Atlaspec.',
    prompt_sha256: 'a'.repeat(64),
    inputs: [],
  };
  return {
    schema_version: '0.1' as const,
    run_id: `${manifest.suite}/task/atlaspec/${repetition}`,
    compiler_commit: 'commit',
    started_at: '2026-07-16T00:00:00Z',
    completed_at: '2026-07-16T00:00:01Z',
    first_attempt_accepted: true,
    final_accepted: true,
    repair_iterations: 0,
    attempts: [
      {
        request,
        response: {
          schema_version: '0.1' as const,
          request_id: request.request_id,
          resolved_model: manifest.model,
          output: 'version: "0.1"',
          finish_reason: 'stop',
          usage: { input_tokens: 1, output_tokens: 1 },
          latency_ms: 1,
          pricing: {
            currency: 'USD' as const,
            input_usd_per_million: 1,
            cached_input_usd_per_million: 1,
            output_usd_per_million: 1,
            source: 'price',
          },
          cost_observed: true,
          charge_source: 'provider',
          charge_usd: 0.01,
          tool_calls: 0,
        },
        checks: [],
        accepted: true,
      },
    ],
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
