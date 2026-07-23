import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { MapLibreRenderMetrics } from '../render/maplibre.js';
import type { V02VisualGateCheck } from './visual-gates.js';

export interface V02PlacementGateLock {
  schema_version: '0.1';
  gate_id: string;
  status: 'locked-before-model-render-reclassification';
  scope: string;
  method: 'maplibre-private-placement-collision-index-v5';
  calibration: {
    split: 'development';
    holdout_exposed: false;
    evaluator_commit: string;
    report_sha256: string;
  };
  thresholds: {
    minimum_label_box_height_px: number;
    maximum_viewport_clipping_ratio: number;
    maximum_overlapping_box_pairs: number;
    maximum_pair_overlap_ratio: number;
    maximum_forced_overlap_boxes: number;
  };
  claim_boundary: string;
}

export interface LoadedV02PlacementGateLock {
  path: string;
  sha256: string;
  lock: V02PlacementGateLock;
}

export async function loadV02PlacementGateLock(
  path = 'benchmark/v02/placement-gates-v1.json',
): Promise<LoadedV02PlacementGateLock> {
  const absolute = resolve(path);
  const raw = await readFile(absolute, 'utf8');
  const value = JSON.parse(raw) as unknown;
  if (!isPlacementGateLock(value)) {
    throw new Error(`Invalid AtlasBench placement-geometry gate lock: ${absolute}`);
  }
  return {
    path: absolute,
    sha256: createHash('sha256').update(raw).digest('hex'),
    lock: value,
  };
}

export function evaluateMapLibrePlacementGates(
  metrics: MapLibreRenderMetrics,
  lock: V02PlacementGateLock,
): { accepted: boolean; checks: V02VisualGateCheck[] } {
  const geometry = metrics.label_geometry;
  const overlapRatio = geometry.maximum_pair_overlap_ratio ?? 0;
  const checks = [
    check(
      'visual.placement-geometry-supported',
      geometry.supported && geometry.method === lock.method,
      `supported=${geometry.supported} method=${geometry.method}`,
    ),
    check(
      'visual.label-box-height',
      geometry.minimum_box_height_px !== null &&
        geometry.minimum_box_height_px >= lock.thresholds.minimum_label_box_height_px,
      `actual=${geometry.minimum_box_height_px ?? 'unresolved'} minimum=${lock.thresholds.minimum_label_box_height_px}`,
    ),
    check(
      'visual.label-box-clipping',
      geometry.maximum_viewport_clipping_ratio !== null &&
        geometry.maximum_viewport_clipping_ratio <=
          lock.thresholds.maximum_viewport_clipping_ratio,
      `actual=${geometry.maximum_viewport_clipping_ratio ?? 'unresolved'} maximum=${lock.thresholds.maximum_viewport_clipping_ratio}`,
    ),
    check(
      'visual.label-box-overlap-pairs',
      geometry.overlapping_box_pairs <= lock.thresholds.maximum_overlapping_box_pairs,
      `actual=${geometry.overlapping_box_pairs} maximum=${lock.thresholds.maximum_overlapping_box_pairs}`,
    ),
    check(
      'visual.label-box-overlap-ratio',
      overlapRatio <= lock.thresholds.maximum_pair_overlap_ratio,
      `actual=${overlapRatio} maximum=${lock.thresholds.maximum_pair_overlap_ratio}`,
    ),
    check(
      'visual.label-forced-overlap',
      geometry.forced_overlap_boxes <= lock.thresholds.maximum_forced_overlap_boxes,
      `actual=${geometry.forced_overlap_boxes} maximum=${lock.thresholds.maximum_forced_overlap_boxes}`,
    ),
  ];
  return { accepted: checks.every((item) => item.passed), checks };
}

function check(code: string, passed: boolean, detail: string): V02VisualGateCheck {
  return { code, passed, detail };
}

function isPlacementGateLock(value: unknown): value is V02PlacementGateLock {
  if (!isRecord(value) || !isRecord(value['thresholds'])) return false;
  const thresholds = value['thresholds'];
  return (
    value['schema_version'] === '0.1' &&
    value['status'] === 'locked-before-model-render-reclassification' &&
    value['method'] === 'maplibre-private-placement-collision-index-v5' &&
    typeof thresholds['minimum_label_box_height_px'] === 'number' &&
    typeof thresholds['maximum_viewport_clipping_ratio'] === 'number' &&
    typeof thresholds['maximum_overlapping_box_pairs'] === 'number' &&
    typeof thresholds['maximum_pair_overlap_ratio'] === 'number' &&
    typeof thresholds['maximum_forced_overlap_boxes'] === 'number'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
