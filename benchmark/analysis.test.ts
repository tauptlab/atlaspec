import { describe, expect, it } from 'vitest';

import { analyzeComparison, LOCKED_THRESHOLDS } from './analysis.js';
import { summarizeRuns, type ExperimentReport } from './experiment.js';
import type {
  BenchmarkCondition,
  GenerationResponse,
  RunRecord,
} from './protocol.js';

describe('AtlasBench paired analysis', () => {
  it('passes the automated gates for a paired reliable and cheaper target', () => {
    const runs: RunRecord[] = [];
    for (let index = 1; index <= 12; index += 1) {
      runs.push(
        run('direct-maplibre', index, index <= 6, 2),
        run('atlaspec', index, true, 0.5),
      );
    }
    const analysis = analyzeComparison(report(runs), {
      ...LOCKED_THRESHOLDS,
      bootstrap_iterations: 2_000,
    });

    expect(analysis).toEqual(
      expect.objectContaining({
        status: 'pass',
        full_benchmark_status: 'not-evaluated',
        baseline: 'direct-maplibre',
        paired_runs: 12,
        relative_failure_reduction: 1,
        primary_gate: 'pass',
        cost_gate: 'pass',
      }),
    );
    expect(analysis.absolute_yield_delta_ci?.lower).toBeGreaterThan(0);
  });

  it('applies the locked non-inferiority margin to a low-failure baseline', () => {
    const runs: RunRecord[] = [];
    for (let index = 1; index <= 20; index += 1) {
      runs.push(
        run('direct-maplibre', index, true, 2),
        run('atlaspec', index, index <= 18, 0.5),
      );
    }
    const analysis = analyzeComparison(report(runs), {
      ...LOCKED_THRESHOLDS,
      bootstrap_iterations: 2_000,
    });

    expect(analysis.primary_gate).toBe('fail');
    expect(analysis.reasons[0]).toContain('non-inferiority gate applies');
  });

  it('does not pass cost when transport failures can hide provider charges', () => {
    const baseline = run('direct-maplibre', 1, false, 0);
    baseline.attempts[0] = {
      request: baseline.attempts[0]!.request,
      transport_error: 'timeout',
      checks: [
        { code: 'transport.generate', passed: false, detail: 'timeout' },
      ],
      accepted: false,
    };
    const analysis = analyzeComparison(
      report([baseline, run('atlaspec', 1, true, 0.5)]),
      { ...LOCKED_THRESHOLDS, bootstrap_iterations: 100 },
    );

    expect(analysis.cost_gate).toBe('insufficient');
    expect(analysis.status).toBe('insufficient');
  });
});

function report(runs: RunRecord[]): ExperimentReport {
  return {
    schema_version: '0.1',
    suite: 'analysis-fixture',
    compiler_commit: 'abc123',
    generated_at: '2026-07-16T00:00:00.000Z',
    manifest_sha256:
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    runs,
    summaries: summarizeRuns(runs),
  };
}

function run(
  condition: BenchmarkCondition,
  repetition: number,
  accepted: boolean,
  cost: number,
): RunRecord {
  const requestId = `analysis-fixture/task/${condition}/${repetition}/1`;
  const response: GenerationResponse = {
    schema_version: '0.1',
    request_id: requestId,
    resolved_model: { provider: 'fixture', model: 'replay', version: '1' },
    output: '{}',
    finish_reason: 'stop',
    usage: { input_tokens: 10, output_tokens: 5 },
    latency_ms: 10,
    pricing: {
      currency: 'USD',
      input_usd_per_million: 0,
      cached_input_usd_per_million: 0,
      output_usd_per_million: 0,
      source: 'fixture override',
    },
    charge_usd: cost,
    tool_calls: 0,
  };
  return {
    schema_version: '0.1',
    run_id: requestId.slice(0, -2),
    compiler_commit: 'abc123',
    started_at: '2026-07-16T00:00:00.000Z',
    completed_at: '2026-07-16T00:00:01.000Z',
    first_attempt_accepted: accepted,
    final_accepted: accepted,
    repair_iterations: 0,
    attempts: [
      {
        request: {
          schema_version: '0.1',
          request_id: requestId,
          suite: 'analysis-fixture',
          task_id: 'task',
          condition,
          repetition,
          attempt: 1,
          model: { provider: 'fixture', model: 'replay', version: '1' },
          sampling: { temperature: 0 },
          prompt: 'Generate a map.',
          prompt_sha256:
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          inputs: [],
        },
        response,
        checks: [
          { code: 'fixture', passed: accepted, detail: 'fixture result' },
        ],
        accepted,
      },
    ],
  };
}
