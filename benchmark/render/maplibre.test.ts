import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { MapLibreStyle } from '../../src/maplibre.js';
import type { InputArtifact } from '../protocol.js';
import {
  actionableMapLibreWarnings,
  geoBounds,
  hydrateMapLibreStyle,
} from './maplibre.js';

describe('MapLibre browser render preparation', () => {
  it('inlines preserved GeoJSON and switches symbol layers to local glyph generation', () => {
    const result = hydrateMapLibreStyle(style(), [
      input('data/points.geojson', [point(127, 37.5), point(129, 35.1)]),
    ]);

    expect(result).toEqual(
      expect.objectContaining({
        discoveredUrls: 1,
        resolvedUrls: 1,
        resolvedFeatures: 2,
        symbolLayers: ['labels'],
      }),
    );
    expect(result.style.layers.map((layer) => layer['id'])).toEqual([
      'background',
      'points',
      'labels',
    ]);
    expect(result.style).not.toHaveProperty('glyphs');
    expect(result.style.sources['points']?.['data']).toEqual(
      expect.objectContaining({ type: 'FeatureCollection' }),
    );
  });

  it('fails closed when a source URL is not backed by the preserved request', () => {
    expect(() => hydrateMapLibreStyle(style(), [])).toThrow(
      "No embedded benchmark input matches MapLibre source 'points' data URL 'data/points.geojson'.",
    );
  });

  it('chooses the short wrapped extent for antimeridian data', () => {
    const bounds = geoBounds([
      input('data/points.geojson', [point(179, 72), point(-179, 73), point(170, 80)]),
    ]);

    expect(bounds[1][0] - bounds[0][0]).toBeLessThan(25);
    expect(bounds[0][1]).toBeLessThanOrEqual(72);
    expect(bounds[1][1]).toBeGreaterThanOrEqual(80);
  });

  it('separates renderer data warnings from known GPU readback noise', () => {
    expect(
      actionableMapLibreWarnings([
        'warning: performance warning: READ-usage buffer was written, then fenced, but written again before being read back.',
        'warning: Expected value to be of type number, but found null instead.',
      ]),
    ).toEqual(['warning: Expected value to be of type number, but found null instead.']);
  });
});

function style(): MapLibreStyle {
  return {
    version: 8,
    name: 'fixture',
    glyphs: 'https://example.invalid/{fontstack}/{range}.pbf',
    metadata: {},
    sources: {
      points: { type: 'geojson', data: 'data/points.geojson' },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#ffffff' } },
      { id: 'points', type: 'circle', source: 'points' },
      { id: 'labels', type: 'symbol', source: 'points', layout: { 'text-field': ['get', 'name'] } },
    ],
  };
}

function point(longitude: number, latitude: number): Record<string, unknown> {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [longitude, latitude] },
    properties: { name: `${longitude},${latitude}` },
  };
}

function input(path: string, features: Record<string, unknown>[]): InputArtifact {
  const content = JSON.stringify({ type: 'FeatureCollection', features });
  return {
    path,
    role: 'data',
    media_type: 'application/geo+json',
    content,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}
