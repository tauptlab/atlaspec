import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildV02CorpusMatrix,
  buildV02Datasets,
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

  it('generates every fresh data path with deterministic adversarial coverage', async () => {
    const matrix = buildV02CorpusMatrix();
    const datasets = buildV02Datasets(matrix);
    const required = new Set(matrix.tasks.flatMap((task) => task.data_files));

    expect(datasets.size).toBe(36);
    expect(new Set(datasets.keys())).toEqual(required);
    for (const [path, expected] of datasets) {
      expect(expected.type).toBe('FeatureCollection');
      expect(expected.features.length).toBeGreaterThan(0);
      const actual = JSON.parse(
        await readFile(resolve('benchmark', 'v02', path), 'utf8'),
      ) as unknown;
      expect(actual).toEqual(expected);
    }

    const multilingual = datasets.get(
      'data/choropleth-categorical-facilities/dense-multilingual-mobile/points.geojson',
    )!;
    expect(multilingual.features[0]!.properties['name']).toContain('긴급대응');
    const geographic = datasets.get(
      'data/choropleth-proportional-symbols/geographic-capability-boundary/areas.geojson',
    )!;
    expect(
      ((geographic.features[0]!.geometry['coordinates'] as number[][][])[0]![0]![0]),
    ).toBeGreaterThan(170);
  });
});
