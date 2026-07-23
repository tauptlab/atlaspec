import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { compileMapLibre } from '../../src/maplibre.js';
import {
  createMapLibreRenderSession,
  type MapLibreRenderMetrics,
} from '../render/maplibre.js';
import type { InputArtifact } from '../protocol.js';
import { buildV02CorpusMatrix, type V02Variant } from './corpus.js';
import { buildV02Manifests, buildV02ReferenceDocument } from './manifest.js';
import {
  evaluateMapLibreVisualGates,
  loadV02VisualGateLock,
  type V02VisualGateCheck,
} from './visual-gates.js';
import {
  evaluateMapLibrePlacementGates,
  loadV02PlacementGateLock,
} from './placement-gates.js';

const executeFile = promisify(execFile);

export interface V02RenderCalibrationEntry {
  task_id: string;
  archetype: string;
  difficulty: string;
  variant: V02Variant;
  accepted: boolean;
  checks: Array<
    { code: string; passed: boolean; detail: string } | V02VisualGateCheck
  >;
  metrics: MapLibreRenderMetrics;
  warnings: string[];
  artifact: string;
}

export interface V02RenderCalibrationReport {
  schema_version: '0.2';
  evidence_kind: 'maplibre-reference-label-calibration';
  generated_at: string;
  evaluator: { commit: string; dirty: boolean };
  split: 'development';
  holdout_exposed: false;
  browser_version: string;
  visual_gate_lock: { path: string; sha256: string; gate_id: string };
  placement_gate_lock: { path: string; sha256: string; gate_id: string };
  summary: {
    tasks: number;
    passed: number;
    failed: number;
    by_variant: Record<
      V02Variant,
      {
        tasks: number;
        minimum_label_coverage: number | null;
        median_label_coverage: number | null;
        maximum_edge_label_ratio: number | null;
        minimum_label_pixels: number;
        minimum_label_box_height_px: number | null;
        maximum_label_box_clipping_ratio: number | null;
        maximum_overlapping_label_box_pairs: number;
        maximum_pair_overlap_ratio: number | null;
        maximum_forced_overlap_boxes: number;
        minimum_point_symbol_pixels: number;
        maximum_point_symbol_box_coverage_ratio: number | null;
        maximum_point_symbol_glyph_coverage_ratio: number | null;
      }
    >;
  };
  entries: V02RenderCalibrationEntry[];
}

export async function writeV02RenderCalibration(
  outputDirectory: string,
  options: { browser_path?: string } = {},
): Promise<V02RenderCalibrationReport> {
  const output = resolve(outputDirectory);
  const temporary = `${output}.tmp-${process.pid}`;
  await assertMissing(output);
  await assertMissing(temporary);
  await mkdir(temporary, { recursive: true });
  const matrix = buildV02CorpusMatrix();
  const manifest = buildV02Manifests(matrix).development;
  const taskMetadata = new Map(matrix.tasks.map((task) => [task.id, task]));
  const visualGate = await loadV02VisualGateLock();
  const placementGate = await loadV02PlacementGateLock();
  const session = await createMapLibreRenderSession({
    ...(options.browser_path === undefined ? {} : { browser_path: options.browser_path }),
  });

  try {
    const entries: V02RenderCalibrationEntry[] = [];
    for (const task of manifest.tasks) {
      const metadata = taskMetadata.get(task.id)!;
      const compiled = compileMapLibre(buildV02ReferenceDocument(task));
      if (!compiled.ok) {
        throw new Error(
          `Reference MapLibre compilation failed for ${task.id}: ${compiled.diagnostics
            .map((diagnostic) => diagnostic.code)
            .join(', ')}`,
        );
      }
      const inputs = await readInputs(task.data_files);
      const rendered = await session.render(compiled.style, inputs);
      const visual = evaluateMapLibreVisualGates(
        rendered.metrics,
        metadata.variant,
        visualGate.lock,
      );
      const placement = evaluateMapLibrePlacementGates(
        rendered.metrics,
        placementGate.lock,
      );
      const artifact = `artifacts/${safeName(task.id)}.png`;
      await mkdir(join(temporary, 'artifacts'), { recursive: true });
      await writeFile(join(temporary, artifact), rendered.png);
      entries.push({
        task_id: task.id,
        archetype: metadata.archetype,
        difficulty: metadata.difficulty,
        variant: metadata.variant,
        accepted: rendered.accepted && visual.accepted && placement.accepted,
        checks: [...rendered.checks, ...visual.checks, ...placement.checks],
        metrics: rendered.metrics,
        warnings: rendered.warnings,
        artifact,
      });
    }

    const evaluator = await readGitState();
    const report: V02RenderCalibrationReport = {
      schema_version: '0.2',
      evidence_kind: 'maplibre-reference-label-calibration',
      generated_at: new Date().toISOString(),
      evaluator,
      split: 'development',
      holdout_exposed: false,
      browser_version: session.browser_version,
      visual_gate_lock: {
        path: visualGate.path,
        sha256: visualGate.sha256,
        gate_id: visualGate.lock.gate_id,
      },
      placement_gate_lock: {
        path: placementGate.path,
        sha256: placementGate.sha256,
        gate_id: placementGate.lock.gate_id,
      },
      summary: {
        tasks: entries.length,
        passed: entries.filter((entry) => entry.accepted).length,
        failed: entries.filter((entry) => !entry.accepted).length,
        by_variant: Object.fromEntries(
          ['canonical', 'missing-and-skew', 'dense-multilingual-mobile', 'geographic-capability-boundary'].map(
            (variant) => [variant, summarizeVariant(entries, variant as V02Variant)],
          ),
        ) as V02RenderCalibrationReport['summary']['by_variant'],
      },
      entries,
    };
    await writeFile(
      join(temporary, 'calibration.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
    await rename(temporary, output);
    return report;
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  } finally {
    await session.close();
  }
}

function summarizeVariant(
  entries: readonly V02RenderCalibrationEntry[],
  variant: V02Variant,
): V02RenderCalibrationReport['summary']['by_variant'][V02Variant] {
  const selected = entries.filter((entry) => entry.variant === variant);
  const coverage = selected
    .map((entry) => entry.metrics.label_coverage)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  const edge = selected
    .map((entry) => entry.metrics.edge_label_ratio)
    .filter((value): value is number => value !== null);
  const boxHeights = selected
    .map((entry) => entry.metrics.label_geometry.minimum_box_height_px)
    .filter((value): value is number => value !== null);
  const clipping = selected
    .map((entry) => entry.metrics.label_geometry.maximum_viewport_clipping_ratio)
    .filter((value): value is number => value !== null);
  const pairOverlap = selected
    .map((entry) => entry.metrics.label_geometry.maximum_pair_overlap_ratio)
    .filter((value): value is number => value !== null);
  const boxCoverage = selected
    .map((entry) => entry.metrics.label_point_occlusion.point_symbol_box_coverage_ratio)
    .filter((value): value is number => value !== null);
  const glyphCoverage = selected
    .map((entry) => entry.metrics.label_point_occlusion.point_symbol_glyph_coverage_ratio)
    .filter((value): value is number => value !== null);
  return {
    tasks: selected.length,
    minimum_label_coverage: coverage[0] ?? null,
    median_label_coverage: median(coverage),
    maximum_edge_label_ratio: edge.length === 0 ? null : Math.max(...edge),
    minimum_label_pixels: Math.min(...selected.map((entry) => entry.metrics.label_pixels)),
    minimum_label_box_height_px:
      boxHeights.length === 0 ? null : Math.min(...boxHeights),
    maximum_label_box_clipping_ratio:
      clipping.length === 0 ? null : Math.max(...clipping),
    maximum_overlapping_label_box_pairs: Math.max(
      ...selected.map((entry) => entry.metrics.label_geometry.overlapping_box_pairs),
    ),
    maximum_pair_overlap_ratio:
      pairOverlap.length === 0 ? null : Math.max(...pairOverlap),
    maximum_forced_overlap_boxes: Math.max(
      ...selected.map((entry) => entry.metrics.label_geometry.forced_overlap_boxes),
    ),
    minimum_point_symbol_pixels: Math.min(
      ...selected.map((entry) => entry.metrics.label_point_occlusion.point_symbol_pixels),
    ),
    maximum_point_symbol_box_coverage_ratio:
      boxCoverage.length === 0 ? null : Math.max(...boxCoverage),
    maximum_point_symbol_glyph_coverage_ratio:
      glyphCoverage.length === 0 ? null : Math.max(...glyphCoverage),
  };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1]! + values[middle]!) / 2
    : values[middle]!;
}

async function readInputs(paths: readonly string[]): Promise<InputArtifact[]> {
  const inputs: InputArtifact[] = [];
  for (const path of paths) {
    const content = await readFile(resolve('benchmark/v02', path), 'utf8');
    inputs.push({
      path,
      role: 'data',
      media_type: 'application/geo+json',
      content,
      sha256: createHash('sha256').update(content).digest('hex'),
    });
  }
  return inputs;
}

async function readGitState(): Promise<{ commit: string; dirty: boolean }> {
  const commit = await executeFile('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  const status = await executeFile('git', ['status', '--porcelain'], { encoding: 'utf8' });
  return {
    commit: commit.stdout.trim(),
    dirty: status.stdout.trim().length > 0,
  };
}

async function assertMissing(path: string): Promise<void> {
  try {
    await access(path);
    throw new Error(`Output already exists: ${path}`);
  } catch (error) {
    if (isRecord(error) && error['code'] === 'ENOENT') return;
    throw error;
  }
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
