import { describe, expect, it } from 'vitest';

import type { GenerationResponse } from '../../protocol.js';
import type { V02RunRecord } from '../experiment.js';
import type {
  V02Condition,
  V02EvaluationManifest,
  V02ManifestTask,
} from '../manifest.js';
import { analyzeV02LocalAgent } from './analysis.js';
import type { V02LocalThresholds } from './bundle.js';

describe('AtlasBench 0.2 task-clustered local analysis', () => {
  it('passes independently locked reliability, token, edit, portability, and capability gates', () => {
    const { manifest, runs } = fixture();
    const analysis = analyzeV02LocalAgent(runs, manifest, thresholds());

    expect(analysis.status).toBe('pass');
    expect(analysis.task_clusters).toBe(10);
    expect(analysis.paired_runs).toBe(20);
    expect(analysis.reliability).toEqual(
      expect.objectContaining({
        direct_yield: 0.5,
        atlaspec_yield: 1,
        absolute_delta: 0.5,
        relative_failure_reduction: 1,
        gate: 'pass',
      }),
    );
    expect(analysis.generation_uncached_tokens_per_accepted_map.gate).toBe('pass');
    expect(analysis.generation_output_tokens_per_accepted_map.gate).toBe('pass');
    expect(analysis.edit_survival.atlaspec).toEqual({
      eligible: 20,
      passed: 20,
      rate: 1,
    });
    expect(analysis.portability).toEqual({
      eligible: 10,
      passed: 10,
      rate: 1,
      gate: 'pass',
    });
    expect(analysis.capability_fail_closed).toEqual({
      eligible: 10,
      passed: 10,
      rate: 1,
      gate: 'pass',
    });
  });

  it('keeps transport failures in yield but makes token evidence insufficient', () => {
    const { manifest, runs } = fixture();
    const atlaspec = runs.find((run) => run.condition === 'atlaspec-maplibre')!;
    delete atlaspec.attempts[0]!.response;
    atlaspec.attempts[0]!.transport_error = 'fixture transport failure';
    atlaspec.first_attempt_accepted = false;
    atlaspec.final_accepted = false;
    atlaspec.edit = null;

    const analysis = analyzeV02LocalAgent(runs, manifest, thresholds());
    expect(analysis.paired_runs).toBe(20);
    expect(analysis.generation_uncached_tokens_per_accepted_map).toEqual(
      expect.objectContaining({ complete: false, gate: 'insufficient' }),
    );
    expect(analysis.generation_output_tokens_per_accepted_map).toEqual(
      expect.objectContaining({ complete: false, gate: 'insufficient' }),
    );
    expect(analysis.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining('no response usage')]),
    );
  });
});

function fixture(): {
  manifest: V02EvaluationManifest;
  runs: V02RunRecord[];
} {
  const tasks: V02ManifestTask[] = [];
  const runs: V02RunRecord[] = [];
  for (let index = 0; index < 10; index += 1) {
    const portable = index < 5;
    const task = taskFixture(index, portable);
    tasks.push(task);
    for (let repetition = 1; repetition <= 2; repetition += 1) {
      const directAccepted = index >= 5;
      runs.push(
        runFixture(task, 'direct-maplibre', repetition, directAccepted, 800, 200),
        runFixture(task, 'atlaspec-maplibre', repetition, true, 150, 50),
      );
      if (portable) {
        runs.push(runFixture(task, 'atlaspec-vega-lite', repetition, true, 150, 50));
      } else {
        runs.push(
          runFixture(task, 'vega-capability-negative', repetition, true, 150, 50),
        );
      }
    }
  }
  return {
    manifest: {
      version: '0.2',
      suite: 'fixture-v02',
      repetitions: 5,
      status: 'runner-ready-model-runs-pending',
      tasks,
    },
    runs,
  };
}

function taskFixture(index: number, portable: boolean): V02ManifestTask {
  const id = `fixture-task-${index}`;
  return {
    id,
    split: 'development',
    prompt: 'fixture',
    edit_prompt: 'fixture edit',
    edit_target: 'points',
    portability: portable ? 'representable' : 'capability-negative',
    capability_requirement: portable
      ? null
      : { kind: 'unsupported-family', layer_id: 'heat', family: 'heatmap' },
    data_files: ['data/fixture.geojson'],
    layers: [
      {
        id: 'points',
        purpose: 'primary',
        family: 'categorical-point',
        source: 'points',
        source_file: 'data/fixture.geojson',
        support: 'point',
        bindings: [{ channel: 'category', field: 'category', path: 'category' }],
        maplibre_types: ['circle'],
        vega_marks: ['circle'],
        missing_data: 'error',
      },
    ],
    conditions: portable
      ? ['direct-maplibre', 'atlaspec-maplibre', 'atlaspec-vega-lite']
      : ['direct-maplibre', 'atlaspec-maplibre', 'vega-capability-negative'],
  };
}

function runFixture(
  task: V02ManifestTask,
  condition: V02Condition,
  repetition: number,
  accepted: boolean,
  inputTokens: number,
  outputTokenCount: number,
): V02RunRecord {
  const runId = `fixture-v02/${task.id}/${condition}/${repetition}`;
  return {
    schema_version: '0.2',
    run_id: runId,
    task_id: task.id,
    condition,
    repetition,
    compiler_commit: 'fixture',
    started_at: '2026-07-21T00:00:00.000Z',
    completed_at: '2026-07-21T00:00:01.000Z',
    first_attempt_accepted: accepted,
    final_accepted: accepted,
    repair_iterations: 0,
    attempts: [
      {
        stage: 'initial',
        request: {
          schema_version: '0.1',
          request_id: `${runId}/1`,
          suite: 'fixture-v02',
          task_id: task.id,
          condition,
          repetition,
          attempt: 1,
          model: { provider: 'fixture', model: 'fixture', version: '1' },
          sampling: { temperature: 0 },
          prompt: 'fixture',
          prompt_sha256: '0'.repeat(64),
          inputs: [],
        },
        response: responseFixture(`${runId}/1`, inputTokens, outputTokenCount),
        checks: [],
        accepted,
      },
    ],
    edit:
      (condition === 'direct-maplibre' || condition === 'atlaspec-maplibre') &&
      accepted
        ? {
            attempted: true,
            accepted: true,
            target_layer: task.edit_target,
            checks: [],
            changed_output_bytes: 1,
          }
        : null,
  };
}

function responseFixture(
  requestId: string,
  inputTokens: number,
  outputTokenCount: number,
): GenerationResponse {
  return {
    schema_version: '0.1',
    request_id: requestId,
    resolved_model: { provider: 'fixture', model: 'fixture', version: '1' },
    output: 'fixture',
    finish_reason: 'completed',
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokenCount,
      cached_input_tokens: 0,
    },
    latency_ms: 1,
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

function thresholds(): V02LocalThresholds {
  return {
    relative_failure_reduction: 0.3,
    uncached_token_reduction: 0.25,
    output_token_reduction: 0.25,
    low_baseline_failure_rate: 0.1,
    yield_noninferiority_margin: 0.03,
    edit_survival: 0.95,
    portability: 0.95,
    capability_fail_closed: 1,
    confidence_level: 0.95,
    bootstrap_iterations: 10000,
    bootstrap_seed: 2803528194,
  };
}
