import { describe, expect, it } from 'vitest';

import { buildCorpusArtifacts, VARIANTS } from '../corpus/corpus.js';
import { buildLocalQualificationBundle, qualificationTaskIds } from './bundle.js';

describe('AtlasBench Local qualification bundle', () => {
  it('selects twelve balanced development tasks without exposing holdout', () => {
    const artifacts = buildCorpusArtifacts();
    const ids = qualificationTaskIds(artifacts.matrix);
    const selected = artifacts.matrix.tasks.filter((task) => ids.has(task.id));
    expect(selected).toHaveLength(12);
    expect(selected.every((task) => task.split === 'development')).toBe(true);
    for (const variant of VARIANTS) {
      expect(selected.filter((task) => task.variant === variant)).toHaveLength(3);
    }
  });

  it('creates three restartable balanced shards per local agent', () => {
    const artifacts = buildCorpusArtifacts();
    const sourceRaw = JSON.stringify(artifacts.development);
    const matrixRaw = JSON.stringify(artifacts.matrix);
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
        source_manifest_raw: sourceRaw,
        matrix_raw: matrixRaw,
        source_directory: 'C:/repo/benchmark/corpus',
        output_directory: 'C:/repo/work/local',
        lockfile_raw: '{}',
        compiler_commit: 'commit',
        generated_at: '2026-07-20T00:00:00Z',
      },
    );

    expect(bundle.ledger.holdout_exposed).toBe(false);
    expect(bundle.ledger.cross_agent_absolute_token_comparison).toBe('prohibited');
    expect(bundle.ledger.totals).toEqual({
      jobs: 6,
      expected_runs: 180,
      base_generation_calls: 180,
      max_generation_calls: 228,
    });
    expect(bundle.manifests).toHaveLength(6);
    for (const manifest of bundle.manifests.values()) {
      expect(manifest.tasks).toHaveLength(4);
      expect(manifest.repetitions).toBe(2);
      expect(manifest.execution_order).toBe('balanced');
    }
  });
});
