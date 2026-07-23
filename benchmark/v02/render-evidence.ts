import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { parse as parseYaml } from 'yaml';

import { compileMapLibre, type MapLibreStyle } from '../../src/maplibre.js';
import { compileVegaLite, type VegaLiteSpec } from '../../src/vega-lite.js';
import {
  createMapLibreRenderSession,
  type MapLibreRenderCheck,
  type MapLibreRenderMetrics,
  type MapLibreRenderSession,
} from '../render/maplibre.js';
import {
  renderVegaLiteSvg,
  type VegaLiteRenderCheck,
  type VegaLiteRenderMetrics,
} from '../render/vega-lite.js';
import type { InputArtifact, ModelIdentity } from '../protocol.js';
import type {
  V02AttemptRecord,
  V02ExperimentReport,
  V02RunRecord,
} from './experiment.js';
import { buildV02CorpusMatrix, type V02Variant } from './corpus.js';
import {
  evaluateMapLibreVisualGates,
  loadV02VisualGateLock,
  type V02VisualGateCheck,
  type V02VisualGateLock,
} from './visual-gates.js';
import {
  evaluateMapLibrePlacementGates,
  loadV02PlacementGateLock,
  type V02PlacementGateLock,
} from './placement-gates.js';
import {
  evaluateMapLibreOcclusionGates,
  loadV02OcclusionGateLock,
  type V02OcclusionGateLock,
} from './occlusion-gates.js';

const RENDERABLE_CONDITIONS = new Set([
  'direct-maplibre',
  'atlaspec-maplibre',
  'direct-vega-lite',
  'atlaspec-vega-lite',
]);
const executeFile = promisify(execFile);

export interface V02RenderEvidenceEntry {
  source_report: string;
  source_report_sha256: string;
  model: ModelIdentity;
  compiler_commit: string;
  run_id: string;
  task_id: string;
  condition:
    | 'direct-maplibre'
    | 'atlaspec-maplibre'
    | 'direct-vega-lite'
    | 'atlaspec-vega-lite';
  renderer: 'maplibre-browser-png' | 'vega-lite-svg';
  repetition: number;
  source_attempt: 'initial' | 'repair';
  accepted: boolean;
  checks: Array<VegaLiteRenderCheck | MapLibreRenderCheck | V02VisualGateCheck>;
  metrics: VegaLiteRenderMetrics | MapLibreRenderMetrics | null;
  warnings: string[];
  artifact: string | null;
  error: string | null;
}

export interface V02RenderEvidenceReport {
  schema_version: '0.5';
  evidence_kind: 'renderer-health';
  generated_at: string;
  evaluator: {
    commit: string;
    dirty: boolean;
  };
  visual_gate_lock: {
    path: string;
    sha256: string;
    gate_id: string;
  };
  placement_gate_lock: {
    path: string;
    sha256: string;
    gate_id: string;
  };
  occlusion_gate_lock: {
    path: string;
    sha256: string;
    gate_id: string;
  };
  source_reports: Array<{
    path: string;
    sha256: string;
    model: ModelIdentity;
    compiler_commit: string;
    runs: number;
  }>;
  summary: {
    source_reports: number;
    experiment_runs: number;
    renderable_runs: number;
    source_accepted_runs: number;
    rendered: number;
    passed: number;
    failed: number;
    skipped_source_failures: number;
    by_renderer: {
      maplibre_browser_png: {
        source_accepted: number;
        passed: number;
        failed: number;
      };
      vega_lite_svg: {
        source_accepted: number;
        passed: number;
        failed: number;
      };
    };
  };
  claim_boundary: string;
  entries: V02RenderEvidenceEntry[];
}

export async function writeV02RenderEvidence(
  reportPaths: readonly string[],
  outputDirectory: string,
  options: { browser_path?: string } = {},
): Promise<V02RenderEvidenceReport> {
  if (reportPaths.length === 0) throw new Error('At least one source report is required.');
  const output = resolve(outputDirectory);
  const temporary = `${output}.tmp-${process.pid}`;
  await assertMissing(output);
  await assertMissing(temporary);
  await mkdir(temporary, { recursive: true });
  let maplibreSession: MapLibreRenderSession | undefined;

  try {
    const entries: V02RenderEvidenceEntry[] = [];
    const sources: V02RenderEvidenceReport['source_reports'] = [];
    const evaluator = await readGitState();
    const visualGate = await loadV02VisualGateLock();
    const placementGate = await loadV02PlacementGateLock();
    const occlusionGate = await loadV02OcclusionGateLock();
    const taskVariants = new Map(
      buildV02CorpusMatrix().tasks.map((task) => [task.id, task.variant]),
    );
    let experimentRuns = 0;
    let renderableRuns = 0;
    let sourceAcceptedRuns = 0;

    for (const reportPath of reportPaths) {
      const absolute = resolve(reportPath);
      const raw = await readFile(absolute, 'utf8');
      const report = readExperimentReport(raw, absolute);
      const sourceHash = sha256(raw);
      const sourceTag = `${safeName(basename(absolute, '.json'))}-${sourceHash.slice(0, 10)}`;
      sources.push({
        path: absolute,
        sha256: sourceHash,
        model: report.model,
        compiler_commit: report.compiler_commit,
        runs: report.runs.length,
      });
      experimentRuns += report.runs.length;

      for (const run of report.runs) {
        if (!isRenderableRun(run)) continue;
        renderableRuns += 1;
        const attempt = acceptedGenerationAttempt(run);
        if (attempt?.response === undefined) continue;
        sourceAcceptedRuns += 1;
        const variant = taskVariants.get(run.task_id);
        if (variant === undefined) throw new Error(`Unknown v0.2 task: ${run.task_id}`);
        try {
          const rendered = await renderAttempt(
            run.condition,
            attempt.response.output,
            attempt.request.inputs,
            variant,
            visualGate.lock,
            placementGate.lock,
            occlusionGate.lock,
            async () => {
              maplibreSession ??= await createMapLibreRenderSession({
                ...(options.browser_path === undefined
                  ? {}
                  : { browser_path: options.browser_path }),
              });
              return maplibreSession;
            },
          );
          const artifact = join(
            'artifacts',
            sourceTag,
            `${safeName(run.run_id)}.${rendered.extension}`,
          ).replaceAll('\\', '/');
          const artifactPath = join(temporary, artifact);
          await mkdir(dirname(artifactPath), { recursive: true });
          await writeFile(artifactPath, rendered.artifact);
          entries.push({
            source_report: absolute,
            source_report_sha256: sourceHash,
            model: report.model,
            compiler_commit: report.compiler_commit,
            run_id: run.run_id,
            task_id: run.task_id,
            condition: run.condition,
            renderer: rendered.renderer,
            repetition: run.repetition,
            source_attempt: attempt.stage,
            accepted: rendered.accepted,
            checks: rendered.checks,
            metrics: rendered.metrics,
            warnings: rendered.warnings,
            artifact,
            error: null,
          });
        } catch (error) {
          entries.push({
            source_report: absolute,
            source_report_sha256: sourceHash,
            model: report.model,
            compiler_commit: report.compiler_commit,
            run_id: run.run_id,
            task_id: run.task_id,
            condition: run.condition,
            renderer: rendererFor(run.condition),
            repetition: run.repetition,
            source_attempt: attempt.stage,
            accepted: false,
            checks: [],
            metrics: null,
            warnings: [],
            artifact: null,
            error: errorMessage(error),
          });
        }
      }
    }

    const passed = entries.filter((entry) => entry.accepted).length;
    const maplibreEntries = entries.filter(
      (entry) => entry.renderer === 'maplibre-browser-png',
    );
    const vegaEntries = entries.filter((entry) => entry.renderer === 'vega-lite-svg');
    const result: V02RenderEvidenceReport = {
      schema_version: '0.5',
      evidence_kind: 'renderer-health',
      generated_at: new Date().toISOString(),
      evaluator,
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
      occlusion_gate_lock: {
        path: occlusionGate.path,
        sha256: occlusionGate.sha256,
        gate_id: occlusionGate.lock.gate_id,
      },
      source_reports: sources,
      summary: {
        source_reports: sources.length,
        experiment_runs: experimentRuns,
        renderable_runs: renderableRuns,
        source_accepted_runs: sourceAcceptedRuns,
        rendered: entries.filter((entry) => entry.artifact !== null).length,
        passed,
        failed: entries.length - passed,
        skipped_source_failures: renderableRuns - sourceAcceptedRuns,
        by_renderer: {
          maplibre_browser_png: {
            source_accepted: maplibreEntries.length,
            passed: maplibreEntries.filter((entry) => entry.accepted).length,
            failed: maplibreEntries.filter((entry) => !entry.accepted).length,
          },
          vega_lite_svg: {
            source_accepted: vegaEntries.length,
            passed: vegaEntries.filter((entry) => entry.accepted).length,
            failed: vegaEntries.filter((entry) => !entry.accepted).length,
          },
        },
      },
      claim_boundary:
        'A pass proves that preserved inputs produced visible geometry through the real MapLibre or Vega runtime and that MapLibre labels met the preregistered coverage, pixel, edge, duplicate, placed-box, clipping, overlap, and sampled point-symbol occlusion gates. This does not prove background contrast, semantic priority, perceptual quality, or human task accuracy.',
      entries,
    };
    await writeFile(
      join(temporary, 'render-evidence.json'),
      `${JSON.stringify(result, null, 2)}\n`,
      'utf8',
    );
    await rename(temporary, output);
    return result;
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  } finally {
    await maplibreSession?.close();
  }
}

async function readGitState(): Promise<{ commit: string; dirty: boolean }> {
  const commit = await executeFile('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  const status = await executeFile('git', ['status', '--porcelain'], { encoding: 'utf8' });
  return {
    commit: commit.stdout.trim(),
    dirty: status.stdout.trim().length > 0,
  };
}

function readExperimentReport(raw: string, path: string): V02ExperimentReport {
  const value = JSON.parse(raw) as unknown;
  if (!isRecord(value)) throw new Error(`Source report is not an object: ${path}`);
  const candidate = isRecord(value['experiment']) ? value['experiment'] : value;
  if (
    candidate['schema_version'] !== '0.2' ||
    !Array.isArray(candidate['runs']) ||
    !isModelIdentity(candidate['model']) ||
    typeof candidate['compiler_commit'] !== 'string'
  ) {
    throw new Error(`Source report is not an AtlasBench 0.2 experiment: ${path}`);
  }
  return candidate as unknown as V02ExperimentReport;
}

type V02RenderableCondition =
  | 'direct-maplibre'
  | 'atlaspec-maplibre'
  | 'direct-vega-lite'
  | 'atlaspec-vega-lite';

function isRenderableRun(
  run: V02RunRecord,
): run is V02RunRecord & { condition: V02RenderableCondition } {
  return RENDERABLE_CONDITIONS.has(run.condition);
}

type V02GenerationAttempt = V02AttemptRecord & { stage: 'initial' | 'repair' };

function acceptedGenerationAttempt(run: V02RunRecord): V02GenerationAttempt | undefined {
  return [...run.attempts]
    .reverse()
    .find(
      (attempt): attempt is V02GenerationAttempt =>
        attempt.stage !== 'edit' && attempt.accepted && attempt.response !== undefined,
    );
}

interface RenderedArtifact {
  renderer: V02RenderEvidenceEntry['renderer'];
  extension: 'png' | 'svg';
  artifact: Uint8Array | string;
  accepted: boolean;
  checks: V02RenderEvidenceEntry['checks'];
  metrics: Exclude<V02RenderEvidenceEntry['metrics'], null>;
  warnings: string[];
}

async function renderAttempt(
  condition: V02RenderableCondition,
  output: string,
  inputs: readonly InputArtifact[],
  variant: V02Variant,
  visualGateLock: V02VisualGateLock,
  placementGateLock: V02PlacementGateLock,
  occlusionGateLock: V02OcclusionGateLock,
  maplibreSession: () => Promise<MapLibreRenderSession>,
): Promise<RenderedArtifact> {
  if (condition === 'direct-maplibre' || condition === 'atlaspec-maplibre') {
    const style = maplibreStyle(condition, output);
    const rendered = await (await maplibreSession()).render(style, inputs);
    const visual = evaluateMapLibreVisualGates(rendered.metrics, variant, visualGateLock);
    const placement = evaluateMapLibrePlacementGates(
      rendered.metrics,
      placementGateLock,
    );
    const occlusion = evaluateMapLibreOcclusionGates(
      rendered.metrics,
      variant,
      occlusionGateLock,
    );
    return {
      renderer: 'maplibre-browser-png',
      extension: 'png',
      artifact: rendered.png,
      accepted:
        rendered.accepted && visual.accepted && placement.accepted && occlusion.accepted,
      checks: [
        ...rendered.checks,
        ...visual.checks,
        ...placement.checks,
        ...occlusion.checks,
      ],
      metrics: rendered.metrics,
      warnings: rendered.warnings,
    };
  }
  const rendered = await renderVegaLiteSvg(vegaLiteSpec(condition, output), inputs);
  return {
    renderer: 'vega-lite-svg',
    extension: 'svg',
    artifact: `${rendered.svg}\n`,
    accepted: rendered.accepted,
    checks: rendered.checks,
    metrics: rendered.metrics,
    warnings: rendered.warnings,
  };
}

function maplibreStyle(
  condition: 'direct-maplibre' | 'atlaspec-maplibre',
  output: string,
): MapLibreStyle {
  if (condition === 'direct-maplibre') {
    const value = JSON.parse(output) as unknown;
    if (!isRecord(value)) throw new Error('Direct MapLibre output is not an object.');
    return value as unknown as MapLibreStyle;
  }
  const compiled = compileMapLibre(parseYaml(output) as unknown);
  if (!compiled.ok) {
    throw new Error(
      `Accepted Atlaspec output no longer compiles to MapLibre: ${compiled.diagnostics
        .map((diagnostic) => diagnostic.code)
        .join(', ')}`,
    );
  }
  return compiled.style;
}

function vegaLiteSpec(
  condition: 'direct-vega-lite' | 'atlaspec-vega-lite',
  output: string,
): VegaLiteSpec {
  if (condition === 'direct-vega-lite') {
    const value = JSON.parse(output) as unknown;
    if (!isRecord(value)) throw new Error('Direct Vega-Lite output is not an object.');
    return value;
  }
  const compiled = compileVegaLite(parseYaml(output) as unknown);
  if (!compiled.ok) {
    throw new Error(
      `Accepted Atlaspec output no longer compiles to Vega-Lite: ${compiled.diagnostics
        .map((diagnostic) => diagnostic.code)
        .join(', ')}`,
    );
  }
  return compiled.spec;
}

function rendererFor(
  condition: V02RenderableCondition,
): V02RenderEvidenceEntry['renderer'] {
  return condition === 'direct-maplibre' || condition === 'atlaspec-maplibre'
    ? 'maplibre-browser-png'
    : 'vega-lite-svg';
}

async function assertMissing(path: string): Promise<void> {
  try {
    await access(path);
    throw new Error(`Output already exists: ${path}`);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'ENOENT';
}

function isModelIdentity(value: unknown): value is ModelIdentity {
  return (
    isRecord(value) &&
    typeof value['provider'] === 'string' &&
    typeof value['model'] === 'string' &&
    typeof value['version'] === 'string'
  );
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 180);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
