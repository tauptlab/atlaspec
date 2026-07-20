import { describe, expect, it } from 'vitest';

import { summarizeRuns } from '../experiment.js';
import { buildCorpusArtifacts } from '../corpus/corpus.js';
import type { RunRecord } from '../protocol.js';
import {
  buildLocalQualificationBundle,
  serializeLocalManifest,
} from './bundle.js';
import { verifyLocalJob, type LocalJobReport } from './status.js';

describe('AtlasBench Local job verification', () => {
  it('requires the exact balanced run set and local model accounting', () => {
    const artifacts = buildCorpusArtifacts();
    const bundle = buildLocalQualificationBundle(
      artifacts.development,
      artifacts.matrix,
      {
        agents: [
          {
            id: 'codex',
            cli_version: 'codex-cli 0.144.4',
            model: {
              provider: 'codex-cli',
              model: 'default',
              version: 'codex-cli 0.144.4;model=unreported',
            },
            cost_observed: false,
          },
          {
            id: 'claude',
            cli_version: '2.1.17 (Claude Code)',
            model: {
              provider: 'claude-cli',
              model: 'opus',
              version: 'claude-opus-4-5-20251101',
            },
            cost_observed: true,
          },
        ],
        source_manifest_raw: JSON.stringify(artifacts.development),
        matrix_raw: JSON.stringify(artifacts.matrix),
        source_directory: 'C:/repo/benchmark/corpus',
        output_directory: 'C:/repo/work/local',
        lockfile_raw: '{}',
        compiler_commit: 'commit',
        generated_at: '2026-07-20T00:00:00Z',
      },
    );
    const job = bundle.ledger.jobs[0]!;
    const manifest = bundle.manifests.get(job.manifest)!;
    const runs: RunRecord[] = [];
    for (const task of manifest.tasks) {
      for (const condition of task.conditions) {
        for (let repetition = 1; repetition <= manifest.repetitions; repetition += 1) {
          runs.push(run(manifest.suite, task.id, condition.condition, repetition, manifest.model));
        }
      }
    }
    const report: LocalJobReport = {
      schema_version: '0.1',
      job_id: job.job_id,
      experiment: {
        schema_version: '0.1',
        suite: manifest.suite,
        compiler_commit: 'commit',
        generated_at: '2026-07-20T00:00:00Z',
        manifest_sha256: job.manifest_sha256,
        runs,
        summaries: summarizeRuns(runs),
      },
    };
    const status = verifyLocalJob(
      bundle.ledger,
      job,
      serializeLocalManifest(manifest),
      manifest,
      report,
    );
    expect(status.state).toBe('complete');
    expect(status.observed_runs).toBe(30);

    report.experiment.runs.pop();
    expect(
      verifyLocalJob(
        bundle.ledger,
        job,
        serializeLocalManifest(manifest),
        manifest,
        report,
      ).state,
    ).toBe('invalid');
  });
});

function run(
  suite: string,
  taskId: string,
  condition: RunRecord['attempts'][number]['request']['condition'],
  repetition: number,
  model: RunRecord['attempts'][number]['request']['model'],
): RunRecord {
  const runId = `${suite}/${taskId}/${condition}/${repetition}`;
  return {
    schema_version: '0.1',
    run_id: runId,
    compiler_commit: 'commit',
    started_at: '2026-07-20T00:00:00Z',
    completed_at: '2026-07-20T00:00:01Z',
    first_attempt_accepted: true,
    final_accepted: true,
    repair_iterations: 0,
    attempts: [
      {
        request: {
          schema_version: '0.1',
          request_id: `${runId}/1`,
          suite,
          task_id: taskId,
          condition,
          repetition,
          attempt: 1,
          model,
          sampling: { temperature: 0 },
          prompt: 'prompt',
          prompt_sha256: 'a'.repeat(64),
          inputs: [],
        },
        response: {
          schema_version: '0.1',
          request_id: `${runId}/1`,
          resolved_model: model,
          output: 'artifact',
          finish_reason: 'stop',
          usage: { input_tokens: 1, output_tokens: 1 },
          latency_ms: 1,
          pricing: {
            currency: 'USD',
            input_usd_per_million: 0,
            cached_input_usd_per_million: 0,
            output_usd_per_million: 0,
            source: 'local',
          },
          cost_observed: false,
          charge_source: 'unavailable',
          charge_usd: 0,
          tool_calls: 0,
        },
        checks: [],
        accepted: true,
      },
    ],
  };
}
