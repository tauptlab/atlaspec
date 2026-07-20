import { describe, expect, it } from 'vitest';

import { buildCorpusArtifacts, VARIANTS } from '../corpus/corpus.js';
import { postFixTaskIds, qualificationTaskIds } from './bundle.js';
import { buildCodexClosureManifest, closureTaskIds } from './closure.js';

describe('Codex closure probe', () => {
  it('uses the final unused balanced development slice', () => {
    const artifacts = buildCorpusArtifacts();
    const ids = closureTaskIds(artifacts.matrix);
    const qualification = qualificationTaskIds(artifacts.matrix);
    const postFix = postFixTaskIds(artifacts.matrix);
    const selected = artifacts.matrix.tasks.filter((task) => ids.has(task.id));

    expect(selected).toHaveLength(12);
    expect(selected.every((task) => task.split === 'development')).toBe(true);
    expect([...ids].every((id) => !qualification.has(id) && !postFix.has(id))).toBe(true);
    for (const variant of VARIANTS) {
      expect(selected.filter((task) => task.variant === variant)).toHaveLength(3);
    }
  });

  it('keeps only one repetition of Atlaspec and repair conditions', () => {
    const artifacts = buildCorpusArtifacts();
    const manifest = buildCodexClosureManifest(
      artifacts.development,
      artifacts.matrix,
      {
        provider: 'codex-cli',
        model: 'default',
        version: 'codex-cli 0.144.4;model=unreported',
      },
      'C:/repo/benchmark/corpus',
      'C:/repo/work/closure',
    );

    expect(manifest.tasks).toHaveLength(12);
    expect(manifest.repetitions).toBe(1);
    expect(manifest.execution_order).toBe('balanced');
    expect(
      manifest.tasks.every((task) =>
        task.conditions.every((condition) =>
          ['atlaspec', 'atlaspec-repair'].includes(condition.condition),
        ),
      ),
    ).toBe(true);
  });
});
