import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildV02CorpusMatrix } from './corpus.js';
import { buildV02Manifests, validateV02Manifest } from './manifest.js';

describe('AtlasBench 0.2 manifests', () => {
  it('locks complete multi-layer contracts and balanced conditions', () => {
    const manifests = buildV02Manifests(buildV02CorpusMatrix());
    expect(validateV02Manifest(manifests.development)).toEqual([]);
    expect(validateV02Manifest(manifests.holdout)).toEqual([]);
    expect(manifests.development.tasks).toHaveLength(36);
    expect(manifests.holdout.tasks).toHaveLength(12);

    for (const task of [
      ...manifests.development.tasks,
      ...manifests.holdout.tasks,
    ]) {
      expect(task.layers).toHaveLength(
        task.id.startsWith('operational-overview') ? 3 : 2,
      );
      expect(task.prompt).toContain('Preserve layer order');
      expect(task.edit_prompt).toContain(task.edit_target);
      expect(task.conditions.includes('direct-vega-lite')).toBe(
        task.portability === 'representable',
      );
    }
  });

  it('matches checked-in development and holdout manifests', async () => {
    const expected = buildV02Manifests(buildV02CorpusMatrix());
    const development = JSON.parse(
      await readFile(resolve('benchmark', 'v02', 'development.manifest.json'), 'utf8'),
    ) as unknown;
    const holdout = JSON.parse(
      await readFile(resolve('benchmark', 'v02', 'holdout.manifest.json'), 'utf8'),
    ) as unknown;

    expect(development).toEqual(expected.development);
    expect(holdout).toEqual(expected.holdout);
  });
});
