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

function officialCompilerWarnings(spec: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));
  try {
    const compiled = compileVegaLiteSpec(spec as unknown as TopLevelSpec);
    parseVega(compiled.spec);
  } finally {
    console.warn = originalWarn;
  }
  return warnings;
}

describe('compileVegaLite', () => {
  it('compiles the portable multi-layer subset without compiler warnings', async () => {
    const result = compileVegaLite(await example('portable-overview.atlas.yaml'));
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;

    expect(officialCompilerWarnings(result.spec)).toEqual([]);
    expect(result.spec['projection']).toEqual({ type: 'mercator' });
    expect(
      (result.spec['layer'] as Array<Record<string, unknown>>).map(
        (layer) => (layer['mark'] as Record<string, unknown>)['type'],
      ),
    ).toEqual(['geoshape', 'circle', 'text']);
    expect(result.decisions.map((decision) => decision.path)).toEqual([
      '/layers/0/encoding/color',
      '/layers/0/constraints/missing_data',
      '/layers/1/encoding/category',
      '/layers/1/encoding/label',
      '/layers/1/constraints/missing_data',
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

  it('escapes literal Vega field paths and compiles hide as a filter', async () => {
    const document = await example('portable-overview.atlas.yaml');
    document.data.fields['flood_probability']!.path = "risk.rate[0]'value";
    document.layers[0]!.constraints!.missing_data = 'hide';

    const result = compileVegaLite(document);
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;
    const fill = (result.spec['layer'] as Array<Record<string, unknown>>)[0]!;
    const encoding = fill['encoding'] as Record<string, Record<string, unknown>>;
    const transform = fill['transform'] as Array<Record<string, string>>;

    expect(encoding['color']!['field']).toBe(
      "properties.risk\\.rate\\[0\\]'value",
    );
    expect(transform).toEqual([
      {
        filter: "isValid(datum['properties']['risk.rate[0]\\'value'])",
      },
    ]);
    expect(officialCompilerWarnings(result.spec)).toEqual([]);
  });

  it('fails closed on explicit missing proportional symbols', async () => {
    const document = await example('operations-overview.atlas.yaml');
    delete document.layers[0]!.encoding.label;
    delete document.layers[1]!.behavior;
    document.layers[1]!.constraints!.missing_data = 'explicit';

    expect(compileVegaLite(document)).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: 'vega-lite.unsupported-explicit-missing-symbol',
          path: '/layers/1/constraints/missing_data',
        }),
      ],
    });
  });

  it('materializes an explicit categorical missing value in the scale and legend', async () => {
    const document = await example('portable-overview.atlas.yaml');
    document.layers[1]!.constraints!.missing_data = 'explicit';

    const result = compileVegaLite(document);
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;
    const symbols = (result.spec['layer'] as Array<Record<string, unknown>>)[1]!;
    const encoding = symbols['encoding'] as Record<
      string,
      Record<string, unknown>
    >;
    const color = encoding['color']!;
    const scale = color['scale'] as Record<string, unknown>;

    expect(color['field']).toBe('_atlaspec_category');
    expect(scale['domain']).toEqual([
      'shelter',
      'hospital',
      'supply-depot',
      'Missing',
    ]);
    expect(symbols['transform']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          as: '_atlaspec_category',
          calculate: expect.stringContaining("'Missing'"),
        }),
      ]),
    );
    expect(officialCompilerWarnings(result.spec)).toEqual([]);
  });
});
