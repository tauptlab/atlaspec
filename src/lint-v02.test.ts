import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { lintAtlaspec } from './lint.js';
import { upgradeAtlaspec } from './migrate.js';
import type { AtlaspecV01Document } from './schema.js';

async function upgradedExample(): Promise<ReturnType<typeof upgradeAtlaspec>> {
  const value = parse(
    await readFile(
      resolve(process.cwd(), 'examples', 'flood-risk.atlas.yaml'),
      'utf8',
    ),
  ) as AtlaspecV01Document;
  return upgradeAtlaspec(value);
}

async function upgradedShelter(): Promise<ReturnType<typeof upgradeAtlaspec>> {
  const value = parse(
    await readFile(
      resolve(process.cwd(), 'examples', 'shelter-capacity.atlas.yaml'),
      'utf8',
    ),
  ) as AtlaspecV01Document;
  return upgradeAtlaspec(value);
}

describe('Atlaspec 0.2 linting', () => {
  it('uses layer-rooted diagnostics for family semantics', async () => {
    const document = await upgradedExample();
    document.layers[0]!.encoding.geometry.support = 'point';

    expect(lintAtlaspec(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'family.geometry-mismatch',
          path: '/layers/0/encoding/geometry/support',
        }),
      ]),
    );
  });

  it('rejects duplicate IDs, multiple primaries, and unknown protected IDs', async () => {
    const document = await upgradedExample();
    document.layers.push({
      ...structuredClone(document.layers[0]!),
    });
    document.constraints = {
      ...document.constraints,
      protected_layers: ['missing'],
    };

    const codes = new Set(lintAtlaspec(document).map((item) => item.code));
    expect(codes.has('layers.duplicate-id')).toBe(true);
    expect(codes.has('layers.primary-count')).toBe(true);
    expect(codes.has('constraints.unknown-protected-layer')).toBe(true);
  });

  it('fails closed when shared MapLibre source clustering semantics conflict', async () => {
    const document = await upgradedExample();
    document.layers.push({
      ...structuredClone(document.layers[0]!),
      id: 'clustered-points',
      purpose: 'supporting',
      family: 'proportional-symbol',
      encoding: {
        geometry: { source: 'districts', support: 'point' },
        size: { field: 'flood_probability' },
      },
      behavior: {
        zoom_rules: [
          { target: 'symbols', action: 'cluster', max_zoom: 9 },
        ],
      },
    });

    expect(lintAtlaspec(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'layers.shared-source-cluster-conflict',
          path: '/layers/1/behavior/zoom_rules',
        }),
      ]),
    );
  });

  it('rejects different cluster configurations on one shared source', async () => {
    const document = await upgradedShelter();
    const second = structuredClone(document.layers[0]!);
    second.id = 'secondary-sites';
    second.purpose = 'supporting';
    delete second.encoding.label;
    second.behavior!.zoom_rules = [
      { target: 'symbols', action: 'cluster', max_zoom: 12 },
    ];
    document.layers.push(second);

    expect(lintAtlaspec(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'layers.shared-source-cluster-config-conflict',
          path: '/layers/1/behavior/zoom_rules',
        }),
      ]),
    );
  });

  it('rejects later choropleths that would occlude the same polygon source', async () => {
    const document = await upgradedExample();
    const second = structuredClone(document.layers[0]!);
    second.id = 'secondary-fill';
    second.purpose = 'supporting';
    delete second.encoding.label;
    document.layers.push(second);

    expect(lintAtlaspec(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'layers.occluded-choropleth',
          path: '/layers/1/encoding/geometry/source',
        }),
      ]),
    );
  });

  it('permits duplicate labels only through an explicit map-level opt-in', async () => {
    const document = await upgradedShelter();
    const second = structuredClone(document.layers[0]!);
    second.id = 'secondary-sites';
    second.purpose = 'supporting';
    document.layers.push(second);

    expect(
      lintAtlaspec(document).some(
        (diagnostic) => diagnostic.code === 'layers.duplicate-label',
      ),
    ).toBe(true);
    document.constraints = {
      ...document.constraints,
      allow_duplicate_labels: true,
    };
    expect(
      lintAtlaspec(document).some(
        (diagnostic) => diagnostic.code === 'layers.duplicate-label',
      ),
    ).toBe(false);
  });
});
