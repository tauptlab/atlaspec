import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  AtlaspecMigrationError,
  downgradeAtlaspec,
  upgradeAtlaspec,
} from './migrate.js';
import type {
  AtlaspecV01Document,
  AtlaspecV02Document,
} from './schema.js';
import { validateAtlaspec } from './validate.js';

async function example(name: string): Promise<AtlaspecV01Document> {
  return parse(
    await readFile(resolve(process.cwd(), 'examples', name), 'utf8'),
  ) as AtlaspecV01Document;
}

describe('Atlaspec migration', () => {
  it('upgrades a 0.1 document into one canonical primary layer', async () => {
    const original = await example('flood-risk.atlas.yaml');
    const snapshot = structuredClone(original);

    const upgraded = upgradeAtlaspec(original);

    expect(original).toEqual(snapshot);
    expect(upgraded.version).toBe('0.2');
    expect(upgraded.layers).toHaveLength(1);
    expect(upgraded.layers[0]).toMatchObject({
      id: 'main',
      purpose: 'primary',
      family: original.family,
      encoding: original.encoding,
      constraints: {
        missing_data: 'explicit',
        raw_count_choropleth: 'reject',
      },
    });
    expect(upgraded.constraints).toEqual({
      colorblind_safe: true,
      viewport: { width: 960, height: 640 },
    });
    expect(validateAtlaspec(upgraded).valid).toBe(true);
  });

  it('returns an equal independent copy when upgrading 0.2', async () => {
    const upgraded = upgradeAtlaspec(await example('flood-risk.atlas.yaml'));
    const second = upgradeAtlaspec(upgraded);

    expect(second).toEqual(upgraded);
    expect(second).not.toBe(upgraded);
    second.layers[0]!.id = 'changed';
    expect(upgraded.layers[0]!.id).toBe('main');
  });

  it('round-trips a representable single-layer document', async () => {
    const original = await example('flood-risk.atlas.yaml');

    expect(downgradeAtlaspec(upgradeAtlaspec(original))).toEqual(original);
  });

  it('conservatively protects the containing layer during upgrade', async () => {
    const upgraded = upgradeAtlaspec(
      await example('shelter-capacity.atlas.yaml'),
    );

    expect(upgraded.constraints?.protected_layers).toEqual(['main']);
    expect(() => downgradeAtlaspec(upgraded)).toThrow(AtlaspecMigrationError);
  });

  it('fails closed when a multi-layer document cannot be downgraded', async () => {
    const upgraded = upgradeAtlaspec(await example('flood-risk.atlas.yaml'));
    const multiLayer: AtlaspecV02Document = {
      ...upgraded,
      layers: [
        upgraded.layers[0]!,
        { ...structuredClone(upgraded.layers[0]!), id: 'support' },
      ],
    };

    expect(() => downgradeAtlaspec(multiLayer)).toThrow(
      'exactly one layer',
    );
  });

  it('fails closed on duplicate-label permission during downgrade', async () => {
    const upgraded = upgradeAtlaspec(await example('flood-risk.atlas.yaml'));
    upgraded.constraints = {
      ...upgraded.constraints,
      allow_duplicate_labels: true,
    };

    expect(() => downgradeAtlaspec(upgraded)).toThrow(
      'duplicate-label permission',
    );
  });
});
