import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { Command } from 'commander';
import { parse as parseYaml } from 'yaml';

import { compileMapLibre } from '../../../src/maplibre.js';
import {
  createMapLibreRenderSession,
  type MapLibreRenderCheck,
  type MapLibreRenderMetrics,
} from '../../render/maplibre.js';
import type { InputArtifact, ModelIdentity } from '../../protocol.js';
import type { V02RunRecord } from '../experiment.js';
import {
  evaluateMapLibreOcclusionGates,
  loadV02OcclusionGateLock,
} from '../occlusion-gates.js';
import type { V02VisualGateCheck } from '../visual-gates.js';
import {
  applyOcclusionAblationDocument,
  applyOcclusionAblationStyle,
  buildOcclusionAblationSchedule,
  type OcclusionAblationArmId,
} from './occlusion-ablation.js';

const TARGET_TASK =
  'choropleth-proportional-symbols-basic-geographic-capability-boundary';
const executeFile = promisify(execFile);

interface SourceCase {
  case_id: string;
  source_report: string;
  source_report_sha256: string;
  model: ModelIdentity;
  run: V02RunRecord;
  output: string;
  inputs: InputArtifact[];
}

interface AblationEntry {
  case_id: string;
  source_report: string;
  model: ModelIdentity;
  run_id: string;
  task_id: string;
  repetition: number;
  arm: OcclusionAblationArmId;
  execution_position: number;
  capacity_range: [number, number] | null;
  label_offset_em: number | null;
  accepted: boolean;
  checks: Array<MapLibreRenderCheck | V02VisualGateCheck>;
  metrics: MapLibreRenderMetrics;
  artifact: string;
}

const program = new Command()
  .name('atlasbench-v02-occlusion-ablation')
  .description('Run development-only range and label-offset ablations on preserved Atlaspec failures')
  .requiredOption('--report <file>', 'source experiment report; repeat for multiple files', collect)
  .requiredOption('--output <directory>', 'new immutable output directory');

program.action(async (options: { report: string[]; output: string }) => {
  const output = resolve(options.output);
  const temporary = `${output}.tmp-${process.pid}`;
  let session: Awaited<ReturnType<typeof createMapLibreRenderSession>> | undefined;
  try {
    await assertMissing(output);
    await assertMissing(temporary);
    const cases = await readCases(options.report);
    if (cases.length !== 4) {
      throw new Error(`Expected four preserved Atlaspec failure cases, found ${cases.length}.`);
    }
    const schedule = buildOcclusionAblationSchedule(cases.map((item) => item.case_id));
    const byId = new Map(cases.map((item) => [item.case_id, item]));
    const gate = await loadV02OcclusionGateLock();
    await mkdir(join(temporary, 'artifacts'), { recursive: true });
    session = await createMapLibreRenderSession();
    const entries: AblationEntry[] = [];

    for (const cell of schedule) {
      const source = byId.get(cell.case_id)!;
      const document = applyOcclusionAblationDocument(
        parseYaml(source.output),
        cell.arm,
      );
      const compiled = compileMapLibre(document);
      if (!compiled.ok) {
        throw new Error(
          `Ablation compilation failed for ${source.case_id}/${cell.arm.id}: ${compiled.diagnostics
            .map((diagnostic) => diagnostic.code)
            .join(', ')}`,
        );
      }
      const style = applyOcclusionAblationStyle(compiled.style, cell.arm);
      const rendered = await session.render(style, source.inputs);
      const occlusion = evaluateMapLibreOcclusionGates(
        rendered.metrics,
        'geographic-capability-boundary',
        gate.lock,
      );
      const artifact = `artifacts/${safeName(source.case_id)}-${cell.arm.id}.png`;
      await writeFile(join(temporary, artifact), rendered.png);
      entries.push({
        case_id: source.case_id,
        source_report: source.source_report,
        model: source.model,
        run_id: source.run.run_id,
        task_id: source.run.task_id,
        repetition: source.run.repetition,
        arm: cell.arm.id,
        execution_position: cell.position,
        capacity_range: cell.arm.capacity_range,
        label_offset_em: cell.arm.label_offset_em,
        accepted: rendered.accepted && occlusion.accepted,
        checks: [...rendered.checks, ...occlusion.checks],
        metrics: rendered.metrics,
        artifact,
      });
      console.log(
        `PROGRESS ${entries.length}/${schedule.length} case=${source.case_id} arm=${cell.arm.id} ` +
          `accepted=${rendered.accepted && occlusion.accepted}`,
      );
    }

    const evaluator = await readGitState();
    const report = {
      schema_version: '0.2-rnd.1',
      evidence_kind: 'maplibre-label-point-occlusion-ablation',
      generated_at: new Date().toISOString(),
      evaluator,
      split: 'development',
      holdout_exposed: false,
      target_task: TARGET_TASK,
      browser_version: session.browser_version,
      occlusion_gate_lock: {
        path: gate.path,
        sha256: gate.sha256,
        gate_id: gate.lock.gate_id,
      },
      source_reports: [...new Map(cases.map((item) => [
        item.source_report,
        {
          path: item.source_report,
          sha256: item.source_report_sha256,
          model: item.model,
        },
      ])).values()],
      summary: Object.fromEntries(
        ['observed', 'reference-range', 'adaptive-offset', 'reference-range-adaptive-offset'].map(
          (arm) => {
            const selected = entries.filter((entry) => entry.arm === arm);
            return [
              arm,
              {
                cases: selected.length,
                passed: selected.filter((entry) => entry.accepted).length,
                maximum_box_coverage_ratio: Math.max(
                  ...selected.map(
                    (entry) =>
                      entry.metrics.label_point_occlusion.point_symbol_box_coverage_ratio ?? 0,
                  ),
                ),
                maximum_glyph_coverage_ratio: Math.max(
                  ...selected.map(
                    (entry) =>
                      entry.metrics.label_point_occlusion.point_symbol_glyph_coverage_ratio ?? 0,
                  ),
                ),
              },
            ];
          },
        ),
      ),
      claim_boundary:
        'This development-only post-failure ablation isolates declared capacity range and compiled label offset on four preserved Atlaspec outputs. It is causal engineering evidence for these cases, not a new qualification or holdout estimate.',
      entries,
    };
    await writeFile(
      join(temporary, 'ablation.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
    await rename(temporary, output);
    console.log(`WROTE ${output} entries=${entries.length}`);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await session?.close();
  }
});

await program.parseAsync(process.argv);

async function readCases(paths: readonly string[]): Promise<SourceCase[]> {
  const cases: SourceCase[] = [];
  for (const path of paths) {
    const absolute = resolve(path);
    const raw = await readFile(absolute, 'utf8');
    const wrapper = JSON.parse(raw) as unknown;
    const report = isRecord(wrapper) && isRecord(wrapper['experiment'])
      ? wrapper['experiment']
      : wrapper;
    if (!isRecord(report) || !Array.isArray(report['runs']) || !isModel(report['model'])) {
      throw new Error(`Invalid AtlasBench report: ${absolute}`);
    }
    for (const runValue of report['runs']) {
      const run = runValue as V02RunRecord;
      if (run.task_id !== TARGET_TASK || run.condition !== 'atlaspec-maplibre') continue;
      const attempt = [...run.attempts]
        .reverse()
        .find(
          (candidate) =>
            candidate.stage !== 'edit' &&
            candidate.accepted &&
            candidate.response !== undefined,
        );
      if (attempt?.response === undefined) continue;
      cases.push({
        case_id: `${report['model'].provider}-rep-${run.repetition}`,
        source_report: absolute,
        source_report_sha256: sha256(raw),
        model: report['model'],
        run,
        output: attempt.response.output,
        inputs: attempt.request.inputs,
      });
    }
  }
  return cases.sort((left, right) => left.case_id.localeCompare(right.case_id));
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

function collect(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isModel(value: unknown): value is ModelIdentity {
  return (
    isRecord(value) &&
    typeof value['provider'] === 'string' &&
    typeof value['model'] === 'string' &&
    typeof value['version'] === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
