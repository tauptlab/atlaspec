import { describe, expect, it } from 'vitest';

import type { MapLibreRenderMetrics } from '../render/maplibre.js';
import {
  evaluateMapLibrePlacementGates,
  loadV02PlacementGateLock,
} from './placement-gates.js';

describe('AtlasBench 0.2 locked placement-geometry gates', () => {
  it('accepts reference-like placed label geometry', async () => {
    const { lock } = await loadV02PlacementGateLock();
    const result = evaluateMapLibrePlacementGates(metrics(), lock);

    expect(result.accepted).toBe(true);
  });

  it('rejects undersized, clipped, overlapping, and forced placement', async () => {
    const { lock } = await loadV02PlacementGateLock();
    const value = metrics();
    value.label_geometry.minimum_box_height_px = 8;
    value.label_geometry.maximum_viewport_clipping_ratio = 0.1;
    value.label_geometry.overlapping_box_pairs = 1;
    value.label_geometry.maximum_pair_overlap_ratio = 0.25;
    value.label_geometry.forced_overlap_boxes = 1;
    const result = evaluateMapLibrePlacementGates(value, lock);

    expect(result.accepted).toBe(false);
    expect(result.checks.filter((check) => !check.passed).map((check) => check.code)).toEqual([
      'visual.label-box-height',
      'visual.label-box-clipping',
      'visual.label-box-overlap-pairs',
      'visual.label-box-overlap-ratio',
      'visual.label-forced-overlap',
    ]);
  });

  it('fails closed when MapLibre placement geometry is unavailable', async () => {
    const { lock } = await loadV02PlacementGateLock();
    const value = metrics();
    value.label_geometry.supported = false;
    value.label_geometry.minimum_box_height_px = null;
    value.label_geometry.maximum_viewport_clipping_ratio = null;
    const result = evaluateMapLibrePlacementGates(value, lock);

    expect(result.accepted).toBe(false);
    expect(result.checks.filter((check) => !check.passed).map((check) => check.code)).toEqual([
      'visual.placement-geometry-supported',
      'visual.label-box-height',
      'visual.label-box-clipping',
    ]);
  });
});

function metrics(): MapLibreRenderMetrics {
  return {
    requested_width: 960,
    requested_height: 640,
    browser_version: 'fixture',
    resolved_data_urls: 1,
    resolved_features: 6,
    loaded_sources: 1,
    total_sources: 1,
    rendered_features: 6,
    geometry_layers: [{ id: 'points', type: 'circle', rendered_features: 6 }],
    symbol_layers: ['labels'],
    label_layers: [
      {
        id: 'labels',
        source: 'points',
        text_field: 'name',
        candidate_labels: 6,
        rendered_labels: 3,
        unique_rendered_labels: 3,
        duplicate_rendered_labels: 0,
        coverage: 0.5,
      },
    ],
    candidate_labels: 6,
    rendered_labels: 3,
    label_coverage: 0.5,
    label_pixels: 63,
    edge_label_pixels: 0,
    edge_label_ratio: 0,
    label_geometry: {
      method: 'maplibre-private-placement-collision-index-v5',
      supported: true,
      boxes: [],
      minimum_box_height_px: 18.375,
      maximum_viewport_clipping_ratio: 0,
      overlapping_box_pairs: 0,
      maximum_pair_overlap_ratio: null,
      forced_overlap_boxes: 0,
    },
    label_point_occlusion: {
      point_symbol_layers: ['points'],
      point_symbol_pixels: 100,
      point_symbol_pixels_covered_by_label_boxes: 0,
      point_symbol_box_coverage_ratio: 0,
      point_symbol_pixels_covered_by_label_glyphs: 0,
      point_symbol_glyph_coverage_ratio: 0,
    },
    sampled_pixels: 38400,
    non_background_pixels: 1000,
    non_background_ratio: 1000 / 38400,
    color_buckets: 10,
    png_bytes: 100,
    png_sha256: '0'.repeat(64),
  };
}
