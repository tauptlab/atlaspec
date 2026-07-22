import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { parse as parseYaml } from 'yaml';

import { compileVegaLite, type VegaLiteSpec } from '../../src/vega-lite.js';
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

const RENDERABLE_CONDITIONS = new Set([
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
  condition: 'direct-vega-lite' | 'atlaspec-vega-lite';
  repetition: number;
  source_attempt: 'initial' | 'repair';
  accepted: boolean;
  checks: VegaLiteRenderCheck[];
  metrics: VegaLiteRenderMetrics | null;
  warnings: string[];
  artifact: string | null;
  error: string | null;
}

export interface V02RenderEvidenceReport {
  schema_version: '0.1';
  evidence_kind: 'vega-lite-svg-render-health';
  generated_at: string;
  evaluator: {
    commit: string;
    dirty: boolean;
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
  };
  claim_boundary: string;
  entries: V02RenderEvidenceEntry[];
}

export async function writeV02RenderEvidence(
  reportPaths: readonly string[],
  outputDirectory: string,
): Promise<V02RenderEvidenceReport> {
  if (reportPaths.length === 0) throw new Error('At least one source report is required.');
  const output = resolve(outputDirectory);
  const temporary = `${output}.tmp-${process.pid}`;
  await assertMissing(output);
  await assertMissing(temporary);
  await mkdir(temporary, { recursive: true });

  try {
    const entries: V02RenderEvidenceEntry[] = [];
    const sources: V02RenderEvidenceReport['source_reports'] = [];
    const evaluator = await readGitState();
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
        const artifact = join(
          'artifacts',
          sourceTag,
          `${safeName(run.run_id)}.svg`,
        ).replaceAll('\\', '/');
        const artifactPath = join(temporary, artifact);
        try {
          const spec = renderSpec(run.condition, attempt.response.output);
          const render = await renderVegaLiteSvg(spec, attempt.request.inputs);
          await mkdir(dirname(artifactPath), { recursive: true });
          await writeFile(artifactPath, `${render.svg}\n`, 'utf8');
          entries.push({
            source_report: absolute,
            source_report_sha256: sourceHash,
            model: report.model,
            compiler_commit: report.compiler_commit,
            run_id: run.run_id,
            task_id: run.task_id,
            condition: run.condition,
            repetition: run.repetition,
            source_attempt: attempt.stage,
            accepted: render.accepted,
            checks: render.checks,
            metrics: render.metrics,
            warnings: render.warnings,
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
    const result: V02RenderEvidenceReport = {
      schema_version: '0.1',
      evidence_kind: 'vega-lite-svg-render-health',
      generated_at: new Date().toISOString(),
      evaluator,
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
      },
      claim_boundary:
        'A pass proves that preserved inputs produced a non-empty, accessible SVG through Vega-Lite and Vega. It does not prove cartographic correctness, label non-overlap, perceptual quality, or human task accuracy.',
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

function isRenderableRun(
  run: V02RunRecord,
): run is V02RunRecord & {
  condition: 'direct-vega-lite' | 'atlaspec-vega-lite';
} {
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

function renderSpec(
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
