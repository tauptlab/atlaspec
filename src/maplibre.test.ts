import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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
