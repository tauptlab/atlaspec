import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { MapLibreRenderMetrics } from '../render/maplibre.js';
import type { V02Variant } from './corpus.js';

export interface V02VisualGateCheck {
  code: string;
  passed: boolean;
  detail: string;
}

export interface V02VisualGateLock {
  schema_version: '0.1';
  gate_id: string;
  status: 'locked-before-model-render-reclassification';
  scope: string;
  calibration: {
    split: 'development';
    holdout_exposed: false;
    evaluator_commit: string;
    report_sha256: string;
  };
  thresholds: {
    minimum_label_coverage_by_variant: Record<V02Variant, number>;
    minimum_label_pixels_by_variant: Record<V02Variant, number>;
    maximum_edge_label_ratio: number;
    maximum_duplicate_rendered_labels: number;
    cluster_fallback: {
      allowed_variant: V02Variant;
      minimum_rendered_cluster_labels: number;
      minimum_label_pixels: number;
    };
  };
  claim_boundary: string;
}

export interface LoadedV02VisualGateLock {
  path: string;
  sha256: string;
  lock: V02VisualGateLock;
}

export async function loadV02VisualGateLock(
  path = 'benchmark/v02/visual-gates-v1.json',
): Promise<LoadedV02VisualGateLock> {
  const absolute = resolve(path);
  const raw = await readFile(absolute, 'utf8');
  const value = JSON.parse(raw) as unknown;
  if (!isVisualGateLock(value)) {
    throw new Error(`Invalid AtlasBench visual gate lock: ${absolute}`);
  }
  return {
    path: absolute,
    sha256: createHash('sha256').update(raw).digest('hex'),
    lock: value,
  };
}

export function evaluateMapLibreVisualGates(
  metrics: MapLibreRenderMetrics,
  variant: V02Variant,
  lock: V02VisualGateLock,
): { accepted: boolean; checks: V02VisualGateCheck[] } {
  const clusterLabels = metrics.label_layers
    .filter((layer) => layer.text_field?.startsWith('point_count') === true)
    .reduce((total, layer) => total + layer.rendered_labels, 0);
  const fallback =
    variant === lock.thresholds.cluster_fallback.allowed_variant &&
    clusterLabels >= lock.thresholds.cluster_fallback.minimum_rendered_cluster_labels &&
    metrics.label_pixels >= lock.thresholds.cluster_fallback.minimum_label_pixels;
  const minimumCoverage = lock.thresholds.minimum_label_coverage_by_variant[variant];
  const minimumPixels = lock.thresholds.minimum_label_pixels_by_variant[variant];
  const duplicates = metrics.label_layers.reduce(
    (total, layer) => total + (layer.duplicate_rendered_labels ?? 0),
    0,
  );
  const checks = [
    check(
      'visual.labels-declared',
      metrics.label_layers.length > 0,
      `layers=${metrics.label_layers.length}`,
    ),
    check(
      'visual.label-coverage',
      fallback ||
        (metrics.label_coverage !== null && metrics.label_coverage >= minimumCoverage),
      `actual=${metrics.label_coverage ?? 'unresolved'} minimum=${minimumCoverage} cluster_fallback=${fallback}`,
    ),
    check(
      'visual.label-pixels',
      fallback || metrics.label_pixels >= minimumPixels,
      `actual=${metrics.label_pixels} minimum=${minimumPixels} cluster_fallback=${fallback}`,
    ),
    check(
      'visual.label-edge-clipping',
      metrics.edge_label_ratio !== null &&
        metrics.edge_label_ratio <= lock.thresholds.maximum_edge_label_ratio,
      `actual=${metrics.edge_label_ratio ?? 'unresolved'} maximum=${lock.thresholds.maximum_edge_label_ratio}`,
    ),
    check(
      'visual.label-duplicates',
      duplicates <= lock.thresholds.maximum_duplicate_rendered_labels,
      `actual=${duplicates} maximum=${lock.thresholds.maximum_duplicate_rendered_labels}`,
    ),
  ];
  return { accepted: checks.every((item) => item.passed), checks };
}

function check(code: string, passed: boolean, detail: string): V02VisualGateCheck {
  return { code, passed, detail };
}

function isVisualGateLock(value: unknown): value is V02VisualGateLock {
  if (!isRecord(value) || !isRecord(value['thresholds'])) return false;
  const thresholds = value['thresholds'];
  return (
    value['schema_version'] === '0.1' &&
    value['status'] === 'locked-before-model-render-reclassification' &&
    isRecord(thresholds['minimum_label_coverage_by_variant']) &&
    isRecord(thresholds['minimum_label_pixels_by_variant']) &&
    typeof thresholds['maximum_edge_label_ratio'] === 'number' &&
    typeof thresholds['maximum_duplicate_rendered_labels'] === 'number' &&
    isRecord(thresholds['cluster_fallback'])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
