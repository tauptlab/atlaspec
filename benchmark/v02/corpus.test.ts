import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildV02CorpusMatrix,
  COMPOSITION_ARCHETYPES,
  validateV02CorpusMatrix,
  V02_DIFFICULTIES,
  V02_VARIANTS,
} from './corpus.js';

describe('AtlasBench 0.2 task matrix', () => {
  it('locks every archetype-difficulty-variant cell exactly once', () => {
    const matrix = buildV02CorpusMatrix();

    expect(validateV02CorpusMatrix(matrix)).toEqual([]);
    expect(matrix.tasks).toHaveLength(
      COMPOSITION_ARCHETYPES.length *
        V02_DIFFICULTIES.length *
        V02_VARIANTS.length,
    );
    expect(matrix.tasks.filter((task) => task.split === 'development')).toHaveLength(36);
    expect(matrix.tasks.filter((task) => task.split === 'holdout')).toHaveLength(12);
  });

  it('separates representable tasks from capability-negative controls', () => {
    const matrix = buildV02CorpusMatrix();

    expect(
      matrix.tasks.filter((task) => task.portability === 'representable'),
    ).toHaveLength(33);
    expect(
      matrix.tasks.filter((task) => task.portability === 'capability-negative'),
    ).toHaveLength(15);
    expect(
      matrix.tasks
        .filter((task) => task.archetype === 'heatmap-reference-points')
        .every((task) => task.portability === 'capability-negative'),
    ).toBe(true);
  });

  it('matches the checked-in matrix byte-for-byte in structure', async () => {
    const actual = JSON.parse(
      await readFile(resolve('benchmark', 'v02', 'matrix.json'), 'utf8'),
    ) as unknown;

    expect(actual).toEqual(buildV02CorpusMatrix());
  });
});
