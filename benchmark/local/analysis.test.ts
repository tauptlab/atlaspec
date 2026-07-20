import { describe, expect, it } from 'vitest';

import { summarizeRuns, type ExperimentReport } from '../experiment.js';
import type { BenchmarkCondition, RunRecord } from '../protocol.js';
import { analyzeLocalAgent } from './analysis.js';
import type { LocalQualificationLedger } from './bundle.js';

const thresholds: LocalQualificationLedger['thresholds'] = {
  relative_failure_reduction: 0.3,
  output_token_reduction: 0.25,
  low_baseline_failure_rate: 0.1,
  yield_noninferiority_margin: 0.03,
  confidence_level: 0.95,
  bootstrap_iterations: 1000,
  bootstrap_seed: 20260720,
};

describe('AtlasBench Local token analysis', () => {
  it('passes non-inferior yield and a confidence-bounded output-token reduction', () => {
    const runs: RunRecord[] = [];
    for (let repetition = 1; repetition <= 20; repetition += 1) {
      runs.push(run('direct-maplibre', repetition, true, 1000));
      runs.push(run('atlaspec', repetition, true, 500));
    }
    const analysis = analyzeLocalAgent(report(runs), thresholds);
    expect(analysis.status).toBe('pass');
    expect(analysis.primary_yield_gate).toBe('pass');
    expect(analysis.output_token_gate).toBe('pass');
    expect(analysis.output_tokens_per_accepted_map.reduction).toBe(0.5);
  });

  it('fails the token gate when compact output does not reach the locked threshold', () => {
    const runs = [
      run('direct-maplibre', 1, true, 100),
      run('atlaspec', 1, true, 90),
    ];
    const analysis = analyzeLocalAgent(report(runs), {
      ...thresholds,
      bootstrap_iterations: 10,
    });
    expect(analysis.primary_yield_gate).toBe('pass');
    expect(analysis.output_token_gate).toBe('fail');
    expect(analysis.status).toBe('fail');
  });
});

function report(runs: RunRecord[]): ExperimentReport {
  return {
    schema_version: '0.1',
    suite: 'local-analysis',
    compiler_commit: 'commit',
    generated_at: '2026-07-20T00:00:00Z',
    manifest_sha256: 'a'.repeat(64),
    runs,
    summaries: summarizeRuns(runs),
  };
}

function run(
  condition: BenchmarkCondition,
  repetition: number,
  accepted: boolean,
  outputTokens: number,
): RunRecord {
  const requestId = `local/task/${condition}/${repetition}/1`;
  return {
    schema_version: '0.1',
    run_id: requestId.slice(0, -2),
    compiler_commit: 'commit',
    started_at: '2026-07-20T00:00:00Z',
    completed_at: '2026-07-20T00:00:01Z',
    first_attempt_accepted: accepted,
    final_accepted: accepted,
    repair_iterations: 0,
    attempts: [
      {
        request: {
          schema_version: '0.1',
          request_id: requestId,
          suite: 'local',
          task_id: 'task',
          condition,
          repetition,
          attempt: 1,
          model: { provider: 'local', model: 'model', version: 'version' },
          sampling: { temperature: 0 },
          prompt: 'prompt',
          prompt_sha256: 'a'.repeat(64),
          inputs: [],
        },
        response: {
          schema_version: '0.1',
          request_id: requestId,
          resolved_model: { provider: 'local', model: 'model', version: 'version' },
          output: 'artifact',
          finish_reason: 'stop',
          usage: { input_tokens: 2000, cached_input_tokens: 1500, output_tokens: outputTokens },
          latency_ms: 100,
          pricing: {
            currency: 'USD',
            input_usd_per_million: 0,
            cached_input_usd_per_million: 0,
            output_usd_per_million: 0,
            source: 'local',
          },
          cost_observed: false,
          charge_source: 'unavailable',
          charge_usd: 0,
          tool_calls: 0,
        },
        checks: [],
        accepted,
      },
    ],
  };
}
