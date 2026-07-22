import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { InputArtifact } from '../protocol.js';
import { renderVegaLiteSvg } from './vega-lite.js';

const geojson = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [127, 37.5] },
      properties: { name: 'Seoul', value: 3, url: 'https://example.invalid/place' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [129, 35.1] },
      properties: { name: 'Busan', value: 7 },
    },
  ],
});

describe('Vega-Lite render evidence', () => {
  it('inlines preserved inputs and proves that data marks reached the SVG', async () => {
    const result = await renderVegaLiteSvg(pointSpec(), [input('data/points.geojson', geojson)]);

    expect(result.accepted).toBe(true);
    expect(result.metrics).toEqual(
      expect.objectContaining({
        requested_width: 320,
        requested_height: 200,
        resolved_data_urls: 1,
        resolved_records: 2,
        circle_marks: 2,
        text_marks: 2,
      }),
    );
    expect(result.svg).toContain('Seoul');
    expect(result.svg).toContain('Busan');
  });

  it('fails closed instead of silently rendering an empty map for an unresolved URL', async () => {
    await expect(renderVegaLiteSvg(pointSpec(), [])).rejects.toThrow(
      "No embedded benchmark input matches Vega-Lite data URL 'data/points.geojson'.",
    );
  });

  it('reports an empty data result as failed render evidence', async () => {
    const empty = JSON.stringify({ type: 'FeatureCollection', features: [] });
    const result = await renderVegaLiteSvg(pointSpec(), [input('data/points.geojson', empty)]);

    expect(result.accepted).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({ code: 'render.data-marks', passed: false }),
    );
  });
});

function pointSpec(): Record<string, unknown> {
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    width: 320,
    height: 200,
    projection: { type: 'mercator' },
    data: {
      url: 'data/points.geojson',
      format: { type: 'json', property: 'features' },
    },
    transform: [
      { calculate: 'datum.geometry.coordinates[0]', as: 'lon' },
      { calculate: 'datum.geometry.coordinates[1]', as: 'lat' },
    ],
    layer: [
      {
        mark: { type: 'circle', size: 100 },
        encoding: {
          longitude: { field: 'lon', type: 'quantitative' },
          latitude: { field: 'lat', type: 'quantitative' },
          size: { field: 'properties.value', type: 'quantitative' },
        },
      },
      {
        mark: { type: 'text', dy: -10 },
        encoding: {
          longitude: { field: 'lon', type: 'quantitative' },
          latitude: { field: 'lat', type: 'quantitative' },
          text: { field: 'properties.name', type: 'nominal' },
        },
      },
    ],
  };
}

function input(path: string, content: string): InputArtifact {
  return {
    path,
    role: 'data',
    media_type: 'application/geo+json',
    content,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}
