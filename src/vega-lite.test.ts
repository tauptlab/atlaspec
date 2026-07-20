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

async function example(): Promise<AtlaspecV02Document> {
  return parseYaml(
    await readFile(
      resolve(process.cwd(), 'examples', 'operations-overview.atlas.yaml'),
      'utf8',
    ),
  ) as AtlaspecV02Document;
}

function representable(document: AtlaspecV02Document): AtlaspecV02Document {
  const result = structuredClone(document);
  delete result.layers[0]!.encoding.label;
  delete result.layers[1]!.behavior;
  return result;
}

describe('compileVegaLite', () => {
  it('compiles the portable multi-layer subset without compiler warnings', async () => {
    const result = compileVegaLite(representable(await example()));
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
      '/layers/1/encoding/size',
      '/layers/1/encoding/label',
    ]);
  });

  it('reports every unsupported requirement instead of dropping it', async () => {
    const diagnostics = inspectVegaLiteCapabilities(await example());

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
    expect(compileVegaLite(await example()).ok).toBe(false);
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
