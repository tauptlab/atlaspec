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
  validateDirectMapLibreSemantics,
  validateDirectVegaLiteSemantics,
} from './semantic.js';
import { buildV02CorpusMatrix } from './corpus.js';
import { buildV02Manifests } from './manifest.js';

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

  it('validates metadata-free direct renderer outputs against locked contracts', () => {
    const task = buildV02Manifests(buildV02CorpusMatrix()).development.tasks.find(
      (candidate) => candidate.id.startsWith('choropleth-proportional-symbols'),
    )!;
    const [areasFile, pointsFile] = task.data_files;
    const maplibre = {
      version: 8 as const,
      name: 'direct',
      glyphs: 'https://example.test/{fontstack}/{range}.pbf',
      metadata: {},
      sources: {
        areas: { type: 'geojson', data: areasFile },
        points: { type: 'geojson', data: pointsFile },
      },
      layers: [
        { id: 'a', type: 'fill', source: 'areas', paint: { 'fill-color': ['get', 'risk_rate'] } },
        { id: 'b', type: 'circle', source: 'points', paint: { 'circle-radius': ['get', 'capacity'] } },
        { id: 'c', type: 'symbol', source: 'points', layout: { 'text-field': ['get', 'name'] } },
      ],
    };
    const vegaLite = {
      layer: [
        { data: { url: areasFile }, mark: 'geoshape', encoding: { color: { field: 'risk_rate' } } },
        { data: { url: pointsFile }, mark: 'circle', encoding: { size: { field: 'capacity' } } },
        { data: { url: pointsFile }, mark: 'text', encoding: { text: { field: 'name' } } },
      ],
    };

    expect(validateDirectMapLibreSemantics(maplibre, task)).toEqual({
      accepted: true,
      diagnostics: [],
    });
    expect(validateDirectVegaLiteSemantics(vegaLite, task)).toEqual({
      accepted: true,
      diagnostics: [],
    });
    (maplibre as unknown as { sources: Record<string, unknown> }).sources = {
      'renamed-areas': maplibre.sources.areas,
      'renamed-points': maplibre.sources.points,
    };
    for (const layer of maplibre.layers) {
      layer.source = layer.source === 'areas' ? 'renamed-areas' : 'renamed-points';
    }
    expect(validateDirectMapLibreSemantics(maplibre, task)).toEqual({
      accepted: true,
      diagnostics: [],
    });
    (maplibre.layers[1]!.paint as Record<string, unknown>)['circle-radius'] = 7;
    expect(validateDirectMapLibreSemantics(maplibre, task)).toEqual(
      expect.objectContaining({
        accepted: false,
        diagnostics: expect.arrayContaining([
          expect.stringContaining('maplibre.binding-missing sites/size/capacity'),
        ]),
      }),
    );
  });
});
