import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parse as parseVega } from 'vega';
import { compile as compileVegaLiteSpec } from 'vega-lite';
import type { TopLevelSpec } from 'vega-lite';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import type { AtlaspecV02Document } from './schema.js';
import {
  compileVegaLite,
  inspectVegaLiteCapabilities,
} from './vega-lite.js';

async function example(name: string): Promise<AtlaspecV02Document> {
  return parseYaml(
    await readFile(
      resolve(process.cwd(), 'examples', name),
      'utf8',
    ),
  ) as AtlaspecV02Document;
}

describe('compileVegaLite', () => {
  it('compiles the portable multi-layer subset without compiler warnings', async () => {
    const result = compileVegaLite(await example('portable-overview.atlas.yaml'));
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));
    try {
      const compiled = compileVegaLiteSpec(
        result.spec as unknown as TopLevelSpec,
      );
      parseVega(compiled.spec);
    } finally {
      console.warn = originalWarn;
    }

    expect(warnings).toEqual([]);
    expect(result.spec['projection']).toEqual({ type: 'mercator' });
    expect(
      (result.spec['layer'] as Array<Record<string, unknown>>).map(
        (layer) => (layer['mark'] as Record<string, unknown>)['type'],
      ),
    ).toEqual(['geoshape', 'circle', 'text']);
    expect(result.decisions.map((decision) => decision.path)).toEqual([
      '/layers/0/encoding/color',
      '/layers/1/encoding/category',
      '/layers/1/encoding/label',
    ]);
  });

  it('reports every unsupported requirement instead of dropping it', async () => {
    const document = await example('operations-overview.atlas.yaml');
    const diagnostics = inspectVegaLiteCapabilities(document);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'vega-lite.unsupported-nonpoint-label',
        path: '/layers/0/encoding/label',
      }),
      expect.objectContaining({
        code: 'vega-lite.unsupported-semantic-zoom',
        path: '/layers/1/behavior/zoom_rules',
      }),
    ]);
    expect(compileVegaLite(document).ok).toBe(false);
  });

  it('requires an explicit 0.2 document', async () => {
    const document = parseYaml(
      await readFile(
        resolve(process.cwd(), 'examples', 'flood-risk.atlas.yaml'),
        'utf8',
      ),
    ) as unknown;

    expect(compileVegaLite(document)).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({ code: 'vega-lite.version-required' }),
      ],
    });
  });
});
