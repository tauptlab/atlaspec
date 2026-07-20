import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildV02CorpusMatrix } from './corpus.js';
import { compile as compileVegaLiteSpec } from 'vega-lite';
import type { TopLevelSpec } from 'vega-lite';
import { parse as parseVega } from 'vega';

import { compileMapLibre } from '../../src/maplibre.js';
import { compileVegaLite } from '../../src/vega-lite.js';
import {
  buildV02Manifests,
  buildV02ReferenceDocument,
  validateV02Manifest,
} from './manifest.js';

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
      expect(task.layers.find((layer) => layer.id === task.edit_target)?.missing_data).not.toBe(
        'hide',
      );
      expect(task.conditions.includes('direct-vega-lite')).toBe(
        task.portability === 'representable',
      );
      expect(task.capability_requirement === null).toBe(
        task.portability === 'representable',
      );
      if (task.capability_requirement !== null) {
        expect(task.prompt).toContain('Capability control:');
      }
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

  it('dry-runs every locked contract through its declared compiler capabilities', () => {
    const manifests = buildV02Manifests(buildV02CorpusMatrix());
    for (const task of [
      ...manifests.development.tasks,
      ...manifests.holdout.tasks,
    ]) {
      const document = buildV02ReferenceDocument(task);
      const maplibre = compileMapLibre(document);
      expect(maplibre.ok, `${task.id} ${JSON.stringify(maplibre.diagnostics)}`).toBe(true);

      const vegaLite = compileVegaLite(document);
      if (task.portability === 'representable') {
        expect(vegaLite.ok, `${task.id} ${JSON.stringify(vegaLite.diagnostics)}`).toBe(true);
        if (!vegaLite.ok) continue;
        const warnings: string[] = [];
        const originalWarn = console.warn;
        console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));
        try {
          parseVega(
            compileVegaLiteSpec(
              vegaLite.spec as unknown as TopLevelSpec,
            ).spec,
          );
        } finally {
          console.warn = originalWarn;
        }
        expect(warnings, task.id).toEqual([]);
      } else {
        expect(vegaLite.ok, task.id).toBe(false);
        if (vegaLite.ok) continue;
        expect(
          vegaLite.diagnostics.every((diagnostic) =>
            diagnostic.code.startsWith('vega-lite.unsupported-'),
          ),
          task.id,
        ).toBe(true);
      }
    }
  });
});
