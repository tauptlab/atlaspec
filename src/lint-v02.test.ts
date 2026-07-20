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
});
