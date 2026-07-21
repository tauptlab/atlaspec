import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { stringify } from 'yaml';
import { describe, expect, it } from 'vitest';

import { compileMapLibre } from '../../src/maplibre.js';
import { compileVegaLite } from '../../src/vega-lite.js';
import type {
  GenerationAdapter,
  GenerationRequest,
  GenerationResponse,
} from '../protocol.js';
import { runV02Experiment } from './experiment.js';
import {
  buildV02ReferenceDocument,
  type V02EvaluationManifest,
  type V02ManifestTask,
} from './manifest.js';

describe('AtlasBench 0.2 model runner', () => {
  it('preserves attempts, repairs once, and evaluates localized edits', async () => {
    const manifest = await developmentManifest();
    const task = manifest.tasks.find((candidate) =>
      candidate.id.startsWith('choropleth-proportional-symbols-basic'),
    )!;
    const adapter = new ReferenceAdapter(new Map([[task.id, task]]), true);
    const report = await runV02Experiment(
      resolve('benchmark/v02/development.manifest.json'),
      adapter,
      {
        model: { provider: 'fixture', model: 'reference', version: '1' },
        sampling: { temperature: 0, max_output_tokens: 8000 },
        repetitions: 1,
        task_ids: [task.id],
      },
    );

    expect(report.runs).toHaveLength(5);
    expect(report.execution_order).toBe('balanced');
    expect(report.runs.every((run) => run.final_accepted)).toBe(true);
    const repaired = report.runs.find((run) => run.condition === 'atlaspec-repair')!;
    expect(repaired.attempts.map((attempt) => attempt.stage)).toEqual([
      'initial',
      'repair',
      'edit',
    ]);
    expect(repaired.repair_iterations).toBe(1);
    expect(repaired.edit?.accepted).toBe(true);
    expect(
      report.runs.find((run) => run.condition === 'direct-maplibre')?.edit?.accepted,
    ).toBe(true);
    expect(
      report.runs.find((run) => run.condition === 'atlaspec-maplibre')?.edit?.accepted,
    ).toBe(true);
    expect(report.summaries.reduce((total, item) => total + item.input_tokens, 0)).toBe(
      adapter.calls * 100,
    );
    expect(adapter.calls).toBe(9);
  });

  it('evaluates an explicit capability-negative Atlaspec response', async () => {
    const manifest = await developmentManifest();
    const task = manifest.tasks.find(
      (candidate) => candidate.portability === 'capability-negative',
    )!;
    const adapter = new ReferenceAdapter(new Map([[task.id, task]]), false);
    const report = await runV02Experiment(
      resolve('benchmark/v02/development.manifest.json'),
      adapter,
      {
        model: { provider: 'fixture', model: 'reference', version: '1' },
        sampling: { temperature: 0 },
        repetitions: 1,
        task_ids: [task.id],
        conditions: ['vega-capability-negative'],
      },
    );

    expect(report.runs).toHaveLength(1);
    expect(report.runs[0]?.final_accepted).toBe(true);
    expect(report.runs[0]?.edit).toBeNull();
  });

  it('rotates condition order using the task position in the locked manifest', async () => {
    const manifest = await developmentManifest();
    const task = manifest.tasks[1]!;
    const adapter = new ReferenceAdapter(new Map([[task.id, task]]), false);
    const report = await runV02Experiment(
      resolve('benchmark/v02/development.manifest.json'),
      adapter,
      {
        model: { provider: 'fixture', model: 'reference', version: '1' },
        sampling: { temperature: 0 },
        repetitions: 1,
        task_ids: [task.id],
        conditions: ['direct-maplibre', 'atlaspec-maplibre'],
      },
    );

    expect(report.runs.map((run) => run.condition)).toEqual([
      'atlaspec-maplibre',
      'direct-maplibre',
    ]);
  });

  it('can select a compact Atlaspec reference for an explicit R&D run', async () => {
    const manifest = await developmentManifest();
    const task = manifest.tasks[0]!;
    const adapter = new ReferenceAdapter(new Map([[task.id, task]]), false);
    await runV02Experiment(
      resolve('benchmark/v02/development.manifest.json'),
      adapter,
      {
        model: { provider: 'fixture', model: 'reference', version: '1' },
        sampling: { temperature: 0 },
        repetitions: 1,
        task_ids: [task.id],
        conditions: ['atlaspec-maplibre'],
        atlaspec_reference_path: '../references/atlaspec-v02-compact.md',
        prompt_layout: 'reference-task-data',
        run_variant: 'compact-reference-first',
      },
    );

    const reference = adapter.requests[0]!.inputs.find(
      (input) => input.role === 'reference',
    )!;
    expect(reference.path).toBe('../references/atlaspec-v02-compact.md');
    expect(reference.content).toContain('# Atlaspec 0.2 compact generation reference');
    expect(adapter.requests[0]!.prompt_layout).toBe('reference-task-data');
    expect(adapter.requests[0]!.request_id).toContain('/compact-reference-first/');
  });

  it('resumes from completed run records without repeating model calls', async () => {
    const manifest = await developmentManifest();
    const task = manifest.tasks[0]!;
    const firstAdapter = new ReferenceAdapter(new Map([[task.id, task]]), false);
    const first = await runV02Experiment(
      resolve('benchmark/v02/development.manifest.json'),
      firstAdapter,
      {
        model: { provider: 'fixture', model: 'reference', version: '1' },
        sampling: { temperature: 0 },
        repetitions: 1,
        task_ids: [task.id],
        conditions: ['direct-vega-lite'],
      },
    );
    const resumedAdapter = new ReferenceAdapter(new Map([[task.id, task]]), false);
    let callbacks = 0;
    const resumed = await runV02Experiment(
      resolve('benchmark/v02/development.manifest.json'),
      resumedAdapter,
      {
        model: { provider: 'fixture', model: 'reference', version: '1' },
        sampling: { temperature: 0 },
        repetitions: 1,
        task_ids: [task.id],
        conditions: ['direct-vega-lite'],
        prior_runs: first.runs,
        on_run_complete: () => {
          callbacks += 1;
        },
      },
    );

    expect(resumed.runs).toEqual(first.runs);
    expect(resumedAdapter.calls).toBe(0);
    expect(callbacks).toBe(0);
  });
});

class ReferenceAdapter implements GenerationAdapter {
  public calls = 0;
  public requests: GenerationRequest[] = [];

  public constructor(
    private readonly tasks: ReadonlyMap<string, V02ManifestTask>,
    private readonly failFirstRepair: boolean,
  ) {}

  public async generate(request: GenerationRequest): Promise<GenerationResponse> {
    this.calls += 1;
    this.requests.push(structuredClone(request));
    const task = this.tasks.get(request.task_id)!;
    if (
      this.failFirstRepair &&
      request.condition === 'atlaspec-repair' &&
      request.attempt === 1
    ) {
      return response(request, 'not: valid: atlaspec');
    }
    const edited = request.prompt.includes('Previous accepted artifact:');
    const document = buildV02ReferenceDocument(task);
    if (edited) {
      document.layers.find((layer) => layer.id === task.edit_target)!.constraints = {
        ...document.layers.find((layer) => layer.id === task.edit_target)!.constraints,
        missing_data: 'hide',
      };
    }
    if (request.condition === 'direct-maplibre') {
      const result = compileMapLibre(document);
      if (!result.ok) throw new Error('reference MapLibre compilation failed');
      return response(request, JSON.stringify(result.style));
    }
    if (request.condition === 'direct-vega-lite') {
      const result = compileVegaLite(document);
      if (!result.ok) throw new Error('reference Vega-Lite compilation failed');
      return response(request, JSON.stringify(result.spec));
    }
    return response(request, stringify(document));
  }
}

function response(request: GenerationRequest, output: string): GenerationResponse {
  return {
    schema_version: '0.1',
    request_id: request.request_id,
    resolved_model: { provider: 'fixture', model: 'reference', version: '1' },
    output,
    finish_reason: 'completed',
    usage: { input_tokens: 100, output_tokens: 20, cached_input_tokens: 0 },
    latency_ms: 5,
    pricing: {
      currency: 'USD',
      input_usd_per_million: 0,
      cached_input_usd_per_million: 0,
      output_usd_per_million: 0,
      source: 'fixture',
    },
    cost_observed: false,
    charge_source: 'fixture',
    charge_usd: 0,
    tool_calls: 0,
  };
}

async function developmentManifest(): Promise<V02EvaluationManifest> {
  return JSON.parse(
    await readFile(resolve('benchmark/v02/development.manifest.json'), 'utf8'),
  ) as V02EvaluationManifest;
}
