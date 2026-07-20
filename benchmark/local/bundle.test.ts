import { describe, expect, it } from 'vitest';

import { buildCorpusArtifacts, VARIANTS } from '../corpus/corpus.js';
import {
  buildLocalQualificationBundle,
  holdoutTaskIds,
  postFixTaskIds,
  qualificationTaskIds,
} from './bundle.js';

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

  it('selects a balanced post-fix slice disjoint from qualification and holdout', () => {
    const artifacts = buildCorpusArtifacts();
    const qualification = qualificationTaskIds(artifacts.matrix);
    const postFix = postFixTaskIds(artifacts.matrix);
    const selected = artifacts.matrix.tasks.filter((task) => postFix.has(task.id));

    expect(selected).toHaveLength(12);
    expect(selected.every((task) => task.split === 'development')).toBe(true);
    expect([...postFix].every((id) => !qualification.has(id))).toBe(true);
    for (const variant of VARIANTS) {
      expect(selected.filter((task) => task.variant === variant)).toHaveLength(3);
    }
  });

  it('identifies the complete balanced frozen holdout', () => {
    const artifacts = buildCorpusArtifacts();
    const ids = holdoutTaskIds(artifacts.matrix);
    const selected = artifacts.matrix.tasks.filter((task) => ids.has(task.id));

    expect(selected).toHaveLength(12);
    expect(selected.every((task) => task.split === 'holdout')).toBe(true);
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

  it('labels the post-fix plan and manifests independently', () => {
    const artifacts = buildCorpusArtifacts();
    const bundle = buildLocalQualificationBundle(
      artifacts.development,
      artifacts.matrix,
      {
        phase: 'postfix',
        agents: testAgents(),
        source_manifest_raw: JSON.stringify(artifacts.development),
        matrix_raw: JSON.stringify(artifacts.matrix),
        source_directory: 'C:/repo/benchmark/corpus',
        output_directory: 'C:/repo/work/local-postfix',
        lockfile_raw: '{}',
        compiler_commit: 'commit',
        generated_at: '2026-07-20T00:00:00Z',
      },
    );

    expect(bundle.ledger.benchmark_id).toBe('atlasbench-local-postfix-v1');
    expect(bundle.ledger.qualification.selection).toBe(
      'second-development-variant-after-rotated-holdout',
    );
    expect(
      [...bundle.manifests.values()].every((manifest) =>
        manifest.suite.startsWith('atlasbench-local-postfix-'),
      ),
    ).toBe(true);
  });

  it('freezes five repetitions and 450 runs for the local holdout', () => {
    const artifacts = buildCorpusArtifacts();
    const bundle = buildLocalQualificationBundle(
      artifacts.holdout,
      artifacts.matrix,
      {
        phase: 'holdout',
        agents: testAgents(),
        source_manifest_raw: JSON.stringify(artifacts.holdout),
        matrix_raw: JSON.stringify(artifacts.matrix),
        source_directory: 'C:/repo/benchmark/corpus',
        output_directory: 'C:/repo/work/local-holdout',
        lockfile_raw: '{}',
        compiler_commit: 'commit',
        generated_at: '2026-07-20T00:00:00Z',
      },
    );

    expect(bundle.ledger.benchmark_id).toBe('atlasbench-local-holdout-v1');
    expect(bundle.ledger.holdout_exposed).toBe(true);
    expect(bundle.ledger.qualification).toEqual({
      task_count: 12,
      repetitions: 5,
      selection: 'frozen-rotated-holdout',
      execution_order: 'balanced',
    });
    expect(bundle.ledger.totals).toEqual({
      jobs: 6,
      expected_runs: 450,
      base_generation_calls: 450,
      max_generation_calls: 570,
    });
    for (const manifest of bundle.manifests.values()) {
      expect(manifest.repetitions).toBe(5);
      expect(manifest.tasks).toHaveLength(4);
    }
  });
});

function testAgents() {
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
