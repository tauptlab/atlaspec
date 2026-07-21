import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { V02CorpusMatrix } from '../corpus.js';
import type {
  V02ExperimentReport,
  V02RunRecord,
} from '../experiment.js';
import type { V02EvaluationManifest } from '../manifest.js';
import {
  buildV02LocalQualificationLedger,
  type V02LocalAgentIdentity,
} from './bundle.js';
import { verifyV02LocalJob, type V02LocalJobReport } from './status.js';

describe('AtlasBench 0.2 local job verification', () => {
  it('accepts an exact immutable shard and rejects run or model drift', async () => {
    const manifestRaw = await readFile(
      resolve('benchmark/v02/development.manifest.json'),
      'utf8',
    );
    const matrixRaw = await readFile(resolve('benchmark/v02/matrix.json'), 'utf8');
    const referenceRaw = await readFile(
      resolve('benchmark/references/atlaspec-v02.md'),
      'utf8',
    );
    const manifest = JSON.parse(manifestRaw) as V02EvaluationManifest;
    const matrix = JSON.parse(matrixRaw) as V02CorpusMatrix;
    const agents = fixtureAgents();
    const ledger = buildV02LocalQualificationLedger(manifest, matrix, {
      agents,
      source_manifest_raw: manifestRaw,
      matrix_raw: matrixRaw,
      reference_raw: referenceRaw,
      lockfile_raw: 'lock',
      compiler_commit: 'abc123',
      generated_at: '2026-07-21T00:00:00.000Z',
    });
    const job = ledger.jobs.find((candidate) => candidate.job_id === 'codex/basic')!;
    const report = fixtureReport(manifest, ledger.source.manifest_sha256, job.task_ids, agents[0]!);

    expect(verifyV02LocalJob(ledger, job, manifest, report)).toEqual({
      job_id: 'codex/basic',
      state: 'complete',
      observed_runs: 36,
      diagnostics: [],
    });

    const partial = structuredClone(report);
    partial.experiment.runs.pop();
    expect(
      verifyV02LocalJob(ledger, job, manifest, partial, { allowPartial: true }),
    ).toEqual({
      job_id: 'codex/basic',
      state: 'complete',
      observed_runs: 35,
      diagnostics: [],
    });

    const drifted = structuredClone(partial);
    drifted.experiment.model.version = 'drifted';
    const invalid = verifyV02LocalJob(ledger, job, manifest, drifted);
    expect(invalid.state).toBe('invalid');
    expect(invalid.diagnostics).toEqual(
      expect.arrayContaining([
        'experiment model mismatch',
        'run count expected=36 actual=35',
        expect.stringContaining('missing run id'),
      ]),
    );
  });
});

function fixtureReport(
  manifest: V02EvaluationManifest,
  manifestSha256: string,
  taskIds: string[],
  agent: V02LocalAgentIdentity,
): V02LocalJobReport {
  const runs: V02RunRecord[] = [];
  for (const task of manifest.tasks.filter((candidate) => taskIds.includes(candidate.id))) {
    for (const condition of task.conditions) {
      for (let repetition = 1; repetition <= 2; repetition += 1) {
        const runId = `${manifest.suite}/${task.id}/${condition}/${repetition}`;
        runs.push({
          schema_version: '0.2',
          run_id: runId,
          task_id: task.id,
          condition,
          repetition,
          compiler_commit: 'abc123',
          started_at: '2026-07-21T00:00:00.000Z',
          completed_at: '2026-07-21T00:00:01.000Z',
          first_attempt_accepted: false,
          final_accepted: false,
          repair_iterations: 0,
          attempts: [
            {
              stage: 'initial',
              request: {
                schema_version: '0.1',
                request_id: `${runId}/1`,
                suite: manifest.suite,
                task_id: task.id,
                condition,
                repetition,
                attempt: 1,
                model: structuredClone(agent.model),
                sampling: { temperature: 0, max_output_tokens: 8000 },
                prompt: 'fixture',
                prompt_sha256: '0'.repeat(64),
                inputs: [],
              },
              transport_error: 'fixture transport failure',
              checks: [
                {
                  code: 'transport.generate',
                  passed: false,
                  detail: 'fixture transport failure',
                },
              ],
              accepted: false,
            },
          ],
          edit: null,
        });
      }
    }
  }
  const experiment: V02ExperimentReport = {
    schema_version: '0.2',
    suite: manifest.suite,
    compiler_commit: 'abc123',
    generated_at: '2026-07-21T00:00:02.000Z',
    manifest_sha256: manifestSha256,
    model: structuredClone(agent.model),
    sampling: { temperature: 0, max_output_tokens: 8000 },
    execution_order: 'balanced',
    runs,
    summaries: [],
  };
  return { schema_version: '0.2', job_id: 'codex/basic', experiment };
}

function fixtureAgents(): [V02LocalAgentIdentity, V02LocalAgentIdentity] {
  return [
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
  ];
}
