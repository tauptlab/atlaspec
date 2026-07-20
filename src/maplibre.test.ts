import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

import {
  validateStyleMin,
  type StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { compileMapLibre } from './maplibre.js';

async function example(name: string): Promise<unknown> {
  return parse(await readFile(resolve('examples', name), 'utf8')) as unknown;
}

describe('compileMapLibre', () => {
  it('compiles all four supported map families', async () => {
    for (const name of [
      'flood-risk.atlas.yaml',
      'shelter-capacity.atlas.yaml',
      'facility-types.atlas.yaml',
      'incident-density.atlas.yaml',
    ]) {
      const result = compileMapLibre(await example(name));
      expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
      if (result.ok) {
        expect(result.style.version).toBe(8);
        expect(result.style.layers.length).toBeGreaterThan(1);
        expect(result.decisions.length).toBeGreaterThan(0);
        expect(
          validateStyleMin(result.style as unknown as StyleSpecification),
        ).toEqual([]);
      }
    }
  });

  it('emits explicit missing-data color and traceable semantic decisions', async () => {
    const result = compileMapLibre(await example('flood-risk.atlas.yaml'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.style.sources['districts']).toEqual({
      type: 'geojson',
      data: './data/districts.geojson',
    });
    expect(result.style.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'flood-risk-fill',
          type: 'fill',
          paint: expect.objectContaining({
            'fill-color': expect.arrayContaining(['case']),
          }),
        }),
      ]),
    );
    expect(result.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'color.palette-inferred' }),
        expect.objectContaining({ code: 'color.domain-selected' }),
      ]),
    );
  });

  it('compiles clustering and square-root radius scaling for symbols', async () => {
    const result = compileMapLibre(await example('shelter-capacity.atlas.yaml'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.style.sources['shelters']).toEqual(
      expect.objectContaining({
        cluster: true,
        clusterMaxZoom: 9,
        clusterRadius: 50,
      }),
    );
    expect(result.style.layers.map((layer) => layer['id'])).toEqual([
      'shelter-capacity-background',
      'shelter-capacity-clusters',
      'shelter-capacity-cluster-count',
      'shelter-capacity-symbols',
      'shelter-capacity-labels',
    ]);
    expect(result.style.layers.at(-1)?.['minzoom']).toBe(12);
    expect(result.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'size.area-proportional-scale' }),
        expect.objectContaining({ code: 'source.cluster-enabled' }),
      ]),
    );
  });

  it('is deterministic for identical documents', async () => {
    const document = await example('facility-types.atlas.yaml');
    const first = compileMapLibre(document);
    const second = compileMapLibre(document);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it.each([
    ['flood-risk.atlas.yaml', '2ec86efcbb813391e3c93d19ce6c19654afc27e9c3726c208e923e1a12f18397'],
    ['shelter-capacity.atlas.yaml', '77b7329e5aaf0fa4735357e1d94cee4864357b95e26a597e1018a46d6c299bc3'],
    ['facility-types.atlas.yaml', 'b5a5cffe40b530048ac1753a625825691b7e3fa64fcdb085f4872c3960021742'],
    ['incident-density.atlas.yaml', '7e8e365b0f05209c4aa9f617399957f64b7c1f66f2b7dbd17ccd46e9b79e0e1d'],
  ])('preserves the frozen 0.1 compiler result for %s', async (name, digest) => {
    const result = compileMapLibre(await example(name));
    const actual = createHash('sha256')
      .update(JSON.stringify(result))
      .digest('hex');

    expect(actual).toBe(digest);
  });

  it('composes Atlaspec 0.2 layers in authored order with stable namespaces', async () => {
    const result = compileMapLibre(
      await example('operations-overview.atlas.yaml'),
    );
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    if (!result.ok) return;

    expect(result.style.layers.map((layer) => layer['id'])).toEqual([
      'operations-overview-background',
      'operations-overview-flood-risk-fill',
      'operations-overview-flood-risk-labels',
      'operations-overview-shelters-clusters',
      'operations-overview-shelters-cluster-count',
      'operations-overview-shelters-symbols',
      'operations-overview-shelters-labels',
    ]);
    expect(Object.keys(result.style.sources)).toEqual(['districts', 'shelters']);
    expect(result.style.metadata['atlaspec:layers']).toEqual([
      { id: 'flood-risk', purpose: 'primary', family: 'choropleth' },
      {
        id: 'shelters',
        purpose: 'supporting',
        family: 'proportional-symbol',
      },
    ]);
    expect(result.style.metadata['atlaspec:legend']).toEqual([
      expect.objectContaining({ layer_id: 'flood-risk', field: 'flood_probability' }),
      expect.objectContaining({ layer_id: 'shelters', field: 'capacity' }),
    ]);
    expect(result.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'color.palette-inferred',
          path: '/layers/0/encoding/color',
        }),
        expect.objectContaining({
          code: 'size.area-proportional-scale',
          path: '/layers/1/encoding/size',
        }),
        expect.objectContaining({
          code: 'constraints.protected-layers',
          path: '/constraints/protected_layers',
        }),
      ]),
    );
    expect(
      validateStyleMin(result.style as unknown as StyleSpecification),
    ).toEqual([]);
  });

  it('fails closed instead of compiling an invalid document', async () => {
    const document = (await example('flood-risk.atlas.yaml')) as Record<
      string,
      unknown
    >;
    const encoding = document['encoding'] as Record<
      string,
      Record<string, unknown>
    >;
    encoding['geometry']!['support'] = 'point';

    const result = compileMapLibre(document);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'family.geometry-mismatch' }),
      ]),
    );
  });
});
