import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';

import { ExperimentManifestSchema } from '../experiment.js';
import {
  buildCorpusArtifacts,
  DIFFICULTIES,
  FAMILIES,
  validateCorpusMatrix,
  VARIANTS,
} from './corpus.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateManifest = ajv.compile(ExperimentManifestSchema);

describe('AtlasBench 48-task corpus', () => {
  it('locks every family-difficulty-variant cell exactly once', () => {
    const artifacts = buildCorpusArtifacts();

    expect(validateCorpusMatrix(artifacts.matrix)).toEqual([]);
    expect(artifacts.matrix.tasks).toHaveLength(
      FAMILIES.length * DIFFICULTIES.length * VARIANTS.length,
    );
    expect(artifacts.development.tasks).toHaveLength(36);
    expect(artifacts.holdout.tasks).toHaveLength(12);
    expect(artifacts.datasets.size).toBe(16);
  });

  it('keeps development and holdout identifiers disjoint and balanced', () => {
    const artifacts = buildCorpusArtifacts();
    const development = new Set(
      artifacts.development.tasks.map((task) => task.id),
    );
    const holdout = new Set(artifacts.holdout.tasks.map((task) => task.id));

    expect([...development].filter((id) => holdout.has(id))).toEqual([]);
    for (const family of FAMILIES) {
      for (const difficulty of DIFFICULTIES) {
        expect(
          artifacts.matrix.tasks.filter(
            (task) =>
              task.family === family &&
              task.difficulty === difficulty &&
              task.split === 'holdout',
          ),
        ).toHaveLength(1);
      }
    }
    for (const variant of VARIANTS) {
      expect(
        artifacts.matrix.tasks.filter(
          (task) => task.variant === variant && task.split === 'holdout',
        ),
      ).toHaveLength(3);
    }
  });

  it('emits strict experiment manifests with format-specific references', () => {
    const artifacts = buildCorpusArtifacts();
    expect(validateManifest(artifacts.development)).toBe(true);
    expect(validateManifest(artifacts.holdout)).toBe(true);

    for (const task of [
      ...artifacts.development.tasks,
      ...artifacts.holdout.tasks,
    ]) {
      expect(task.conditions.some((item) => item.condition === 'direct-maplibre')).toBe(true);
      expect(task.conditions.some((item) => item.condition === 'atlaspec')).toBe(true);
      expect(task.conditions.some((item) => item.condition === 'atlaspec-repair')).toBe(true);
      expect(
        task.conditions.every(
          (item) => item.reference_files?.length === 1,
        ),
      ).toBe(true);
      expect(task.conditions.some((item) => item.condition === 'direct-vega-lite')).toBe(
        task.family !== 'heatmap',
      );
    }
  });

  it('matches all checked-in generated artifacts byte-for-byte in structure', async () => {
    const artifacts = buildCorpusArtifacts();
    const matrix = JSON.parse(
      await readFile(resolve('benchmark', 'corpus', 'matrix.json'), 'utf8'),
    ) as unknown;
    const development = JSON.parse(
      await readFile(
        resolve('benchmark', 'corpus', 'development.manifest.json'),
        'utf8',
      ),
    ) as unknown;
    const holdout = JSON.parse(
      await readFile(
        resolve('benchmark', 'corpus', 'holdout.manifest.json'),
        'utf8',
      ),
    ) as unknown;

    expect(matrix).toEqual(artifacts.matrix);
    expect(development).toEqual(artifacts.development);
    expect(holdout).toEqual(artifacts.holdout);
    for (const [path, expected] of artifacts.datasets) {
      const actual = JSON.parse(
        await readFile(resolve('benchmark', 'corpus', path), 'utf8'),
      ) as unknown;
      expect(actual).toEqual(expected);
    }
  });
});
