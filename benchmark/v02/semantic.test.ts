import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { compileMapLibre } from '../../src/maplibre.js';
import type { AtlaspecV02Document } from '../../src/schema.js';
import { buildSemanticRecord } from '../../src/semantic.js';
import { compileVegaLite } from '../../src/vega-lite.js';
import {
  compareSemanticRecords,
  compareUntargetedLayers,
  extractMapLibreSemantics,
  extractVegaLiteSemantics,
} from './semantic.js';

async function portable(): Promise<AtlaspecV02Document> {
  return parse(
    await readFile(
      resolve('examples', 'portable-overview.atlas.yaml'),
      'utf8',
    ),
  ) as AtlaspecV02Document;
}

describe('AtlasBench 0.2 semantic normalization', () => {
  it('extracts identical semantic contracts from both compiler targets', async () => {
    const document = await portable();
    const expected = buildSemanticRecord(document);
    const maplibre = compileMapLibre(document);
    const vegaLite = compileVegaLite(document);
    expect(maplibre.ok).toBe(true);
    expect(vegaLite.ok).toBe(true);
    if (!maplibre.ok || !vegaLite.ok) return;

    const maplibreRecord = extractMapLibreSemantics(maplibre.style);
    const vegaLiteRecord = extractVegaLiteSemantics(vegaLite.spec);
    expect(maplibreRecord.ok).toBe(true);
    expect(vegaLiteRecord.ok).toBe(true);
    if (!maplibreRecord.ok || !vegaLiteRecord.ok) return;

    expect(compareSemanticRecords(expected, maplibreRecord.record)).toEqual({
      equal: true,
      differences: [],
    });
    expect(compareSemanticRecords(expected, vegaLiteRecord.record)).toEqual({
      equal: true,
      differences: [],
    });
  });

  it('does not trust metadata when the matching renderer layer is absent', async () => {
    const document = await portable();
    const result = compileMapLibre(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.style.layers = result.style.layers.filter(
      (layer) => !String(layer['id']).includes('-facilities-'),
    );

    expect(extractMapLibreSemantics(result.style)).toEqual({
      ok: false,
      diagnostics: ['maplibre.layer-missing facilities'],
    });
  });

  it('measures edit survival only outside the named target layer', async () => {
    const document = await portable();
    const before = buildSemanticRecord(document);
    document.layers[1]!.constraints!.missing_data = 'hide';
    const afterTargetEdit = buildSemanticRecord(document);
    expect(
      compareUntargetedLayers(before, afterTargetEdit, 'facilities'),
    ).toEqual({ equal: true, differences: [] });

    document.layers[0]!.constraints!.missing_data = 'hide';
    const afterUnrelatedEdit = buildSemanticRecord(document);
    const comparison = compareUntargetedLayers(
      before,
      afterUnrelatedEdit,
      'facilities',
    );
    expect(comparison.equal).toBe(false);
    expect(comparison.differences).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/layers/0/missing_data'),
      ]),
    );
  });
});
