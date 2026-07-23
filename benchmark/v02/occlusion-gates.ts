import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { MapLibreRenderMetrics } from '../render/maplibre.js';
import type { V02Variant } from './corpus.js';
import type { V02VisualGateCheck } from './visual-gates.js';

export interface V02OcclusionGateLock {
  schema_version: '0.1';
  gate_id: string;
  status: 'locked-before-model-render-reclassification';
  scope: string;
  method: 'layer-isolated-quarter-resolution-rgb-difference-v1';
  calibration: {
    split: 'development';
    holdout_exposed: false;
    evaluator_commit: string;
    report_sha256: string;
  };
  thresholds: {
    minimum_point_symbol_pixels_by_variant: Record<V02Variant, number>;
    maximum_point_symbol_box_coverage_ratio_by_variant: Record<V02Variant, number>;
    maximum_point_symbol_glyph_coverage_ratio_by_variant: Record<V02Variant, number>;
  };
  claim_boundary: string;
}

export interface LoadedV02OcclusionGateLock {
  path: string;
  sha256: string;
  lock: V02OcclusionGateLock;
}

export async function loadV02OcclusionGateLock(
  path = 'benchmark/v02/occlusion-gates-v1.json',
): Promise<LoadedV02OcclusionGateLock> {
  const absolute = resolve(path);
  const raw = await readFile(absolute, 'utf8');
  const value = JSON.parse(raw) as unknown;
  if (!isOcclusionGateLock(value)) {
    throw new Error(`Invalid AtlasBench label-point occlusion gate lock: ${absolute}`);
  }
  return {
    path: absolute,
    sha256: createHash('sha256').update(raw).digest('hex'),
    lock: value,
  };
}

export function evaluateMapLibreOcclusionGates(
  metrics: MapLibreRenderMetrics,
  variant: V02Variant,
  lock: V02OcclusionGateLock,
): { accepted: boolean; checks: V02VisualGateCheck[] } {
  const occlusion = metrics.label_point_occlusion;
  const minimumPixels = lock.thresholds.minimum_point_symbol_pixels_by_variant[variant];
  const maximumBoxCoverage =
    lock.thresholds.maximum_point_symbol_box_coverage_ratio_by_variant[variant];
  const maximumGlyphCoverage =
    lock.thresholds.maximum_point_symbol_glyph_coverage_ratio_by_variant[variant];
  const checks = [
    check(
      'visual.point-symbol-pixels',
      occlusion.point_symbol_pixels >= minimumPixels,
      `actual=${occlusion.point_symbol_pixels} minimum=${minimumPixels}`,
    ),
    check(
      'visual.label-box-point-symbol-occlusion',
      occlusion.point_symbol_box_coverage_ratio !== null &&
        occlusion.point_symbol_box_coverage_ratio <= maximumBoxCoverage,
      `actual=${occlusion.point_symbol_box_coverage_ratio ?? 'unresolved'} maximum=${maximumBoxCoverage}`,
    ),
    check(
      'visual.label-glyph-point-symbol-occlusion',
      occlusion.point_symbol_glyph_coverage_ratio !== null &&
        occlusion.point_symbol_glyph_coverage_ratio <= maximumGlyphCoverage,
      `actual=${occlusion.point_symbol_glyph_coverage_ratio ?? 'unresolved'} maximum=${maximumGlyphCoverage}`,
    ),
  ];
  return { accepted: checks.every((item) => item.passed), checks };
}

function check(code: string, passed: boolean, detail: string): V02VisualGateCheck {
  return { code, passed, detail };
}

function isOcclusionGateLock(value: unknown): value is V02OcclusionGateLock {
  if (!isRecord(value) || !isRecord(value['thresholds'])) return false;
  const thresholds = value['thresholds'];
  return (
    value['schema_version'] === '0.1' &&
    value['status'] === 'locked-before-model-render-reclassification' &&
    value['method'] === 'layer-isolated-quarter-resolution-rgb-difference-v1' &&
    isRecord(thresholds['minimum_point_symbol_pixels_by_variant']) &&
    isRecord(thresholds['maximum_point_symbol_box_coverage_ratio_by_variant']) &&
    isRecord(thresholds['maximum_point_symbol_glyph_coverage_ratio_by_variant'])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
