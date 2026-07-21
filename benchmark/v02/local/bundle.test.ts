import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { V02CorpusMatrix } from '../corpus.js';
import type { V02EvaluationManifest } from '../manifest.js';
import {
  buildV02LocalQualificationLedger,
  qualificationTaskIds,
} from './bundle.js';

describe('AtlasBench 0.2 local qualification bundle', () => {
  it('locks an unseen 12-task development slice and exact call budget', async () => {
    const { manifest, manifestRaw, matrix, matrixRaw } = await sources();
    const selected = qualificationTaskIds(matrix);
    expect(selected.size).toBe(12);
    expect(
      matrix.tasks.filter((task) => selected.has(task.id) && task.split === 'holdout'),
    ).toEqual([]);
    expect(selected).toContain(
      'choropleth-proportional-symbols-basic-geographic-capability-boundary',
    );

    const ledger = buildV02LocalQualificationLedger(manifest, matrix, {
      agents: agents(),
      source_manifest_raw: manifestRaw,
      matrix_raw: matrixRaw,
      lockfile_raw: 'lock',
      compiler_commit: 'abc123',
      generated_at: '2026-07-21T00:00:00.000Z',
    });

    expect(ledger.holdout_exposed).toBe(false);
    expect(ledger.qualification).toEqual({
      task_count: 12,
      repetitions: 2,
      selection: 'third-development-variant-after-rotated-holdout',
      execution_order: 'balanced',
    });
    expect(ledger.jobs).toHaveLength(6);
    expect(ledger.jobs.every((job) => job.task_ids.length === 4)).toBe(true);
    expect(ledger.jobs.every((job) => job.expected_runs === 36)).toBe(true);
    expect(ledger.jobs.every((job) => job.max_generation_calls === 68)).toBe(true);
    expect(ledger.totals).toEqual({
      jobs: 6,
      expected_runs: 216,
      base_generation_calls: 216,
      max_generation_calls: 408,
    });
  });
});

async function sources(): Promise<{
  manifest: V02EvaluationManifest;
  manifestRaw: string;
  matrix: V02CorpusMatrix;
  matrixRaw: string;
}> {
  const manifestRaw = await readFile(
    resolve('benchmark/v02/development.manifest.json'),
    'utf8',
  );
  const matrixRaw = await readFile(resolve('benchmark/v02/matrix.json'), 'utf8');
  return {
    manifest: JSON.parse(manifestRaw) as V02EvaluationManifest,
    manifestRaw,
    matrix: JSON.parse(matrixRaw) as V02CorpusMatrix,
    matrixRaw,
  };
}

function agents() {
  return [
    {
      id: 'codex' as const,
      cli_version: 'codex-cli 0.144.4',
      model: {
        provider: 'codex-cli',
        model: 'default',
        version: 'codex-cli 0.144.4;model=unreported',
      },
      cost_observed: false,
    },
    {
      id: 'claude' as const,
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
