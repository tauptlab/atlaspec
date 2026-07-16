import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runSuite } from './suite.js';

describe('AtlasBench pilot', () => {
  it('accepts the four canonical compiler fixtures', async () => {
    const report = await runSuite(resolve('benchmark', 'pilot.manifest.json'));

    expect(report).toEqual(
      expect.objectContaining({
        schema_version: '0.1',
        suite: 'atlaspec-compiler-pilot',
        condition: 'atlaspec-fixture',
        attempted: 4,
        accepted: 4,
        reliable_map_yield: 1,
      }),
    );
    expect(report.results.every((result) => result.accepted)).toBe(true);
  });
});
