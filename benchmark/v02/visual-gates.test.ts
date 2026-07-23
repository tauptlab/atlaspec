import { describe, expect, it } from 'vitest';

import type { MapLibreRenderMetrics } from '../render/maplibre.js';
import {
  evaluateMapLibreVisualGates,
  loadV02VisualGateLock,
} from './visual-gates.js';

describe('AtlasBench 0.2 locked label gates', () => {
  it('accepts calibrated canonical label evidence', async () => {
    const { lock } = await loadV02VisualGateLock();
    const result = evaluateMapLibreVisualGates(metrics(), 'canonical', lock);

    expect(result.accepted).toBe(true);
  });

  it('rejects low coverage, duplicate labels, and edge clipping', async () => {
    const { lock } = await loadV02VisualGateLock();
    const value = metrics();
    value.label_coverage = 1 / 6;
    value.edge_label_ratio = 0.1;
    value.label_layers[0]!.duplicate_rendered_labels = 1;
    const result = evaluateMapLibreVisualGates(value, 'canonical', lock);

    expect(result.accepted).toBe(false);
    expect(result.checks.filter((check) => !check.passed).map((check) => check.code)).toEqual([
      'visual.label-coverage',
      'visual.label-edge-clipping',
      'visual.label-duplicates',
    ]);
  });

  it('allows a visible geographic cluster-count fallback', async () => {
    const { lock } = await loadV02VisualGateLock();
    const value = metrics();
    value.label_coverage = 0;
    value.label_pixels = 1;
    value.label_layers.push({
      id: 'cluster-count',
      source: 'points',
      text_field: 'point_count_abbreviated',
      candidate_labels: null,
      rendered_labels: 1,
      unique_rendered_labels: 1,
      duplicate_rendered_labels: 0,
      coverage: null,
    });
    const result = evaluateMapLibreVisualGates(
      value,
      'geographic-capability-boundary',
      lock,
    );

    expect(result.accepted).toBe(true);
    expect(result.checks.find((check) => check.code === 'visual.label-coverage')?.detail).toContain(
      'cluster_fallback=true',
    );
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
      minimum_box_height_px: 20,
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
