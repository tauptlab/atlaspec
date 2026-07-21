import { describe, expect, it } from 'vitest';

import type { GenerationResponse } from '../../protocol.js';
import type { V02RunRecord } from '../experiment.js';
import { analyzeReferenceLayoutRuns } from './reference-layout-analysis.js';

describe('reference-layout R&D analysis', () => {
  it('passes reliability and exposes compact and layout effects independently', () => {
    const runs = [
      run('full-data-first', 1000, 200),
      run('full-reference-first', 900, 190),
      run('compact-data-first', 800, 205),
      run('compact-reference-first', 780, 195),
    ];
    const result = analyzeReferenceLayoutRuns(runs, thresholds());

    expect(result.status).toBe('pass');
    expect(result.compact_effect.data_first.uncached_input_reduction).toBe(0.2);
    expect(result.layout_effect.full.uncached_input_reduction).toBe(0.1);
    expect(result.arms['full-data-first']?.edit_gate).toBe('pass');
  });

  it('keeps transport failures in reliability and makes token comparisons insufficient', () => {
    const runs = [
      run('full-data-first', 1000, 200, false),
      run('full-reference-first', 900, 190),
      run('compact-data-first', 800, 205),
      run('compact-reference-first', 780, 195),
    ];
    const result = analyzeReferenceLayoutRuns(runs, thresholds());

    expect(result.status).toBe('fail');
    expect(result.arms['full-data-first']?.transport_failures).toBe(1);
    expect(result.arms['full-data-first']?.reliability_gate).toBe('fail');
    expect(result.compact_effect.data_first.input_gate).toBe('insufficient');
    expect(result.layout_effect.full.output_gate).toBe('insufficient');
  });
});

function thresholds() {
  return {
    first_attempt_yield_per_arm: 0.9,
    eligible_edit_survival_per_arm: 0.9,
    compact_uncached_input_reduction_within_layout: 0.1,
    reference_first_uncached_input_noninferiority_margin: 0.05,
    output_token_regression_margin: 0.1,
  };
}

function run(
  variant: string,
  input: number,
  output: number,
  responded = true,
): V02RunRecord {
  const requestId = `suite/task/atlaspec-maplibre/1/${variant}/1`;
  const response: GenerationResponse = {
    schema_version: '0.1',
    request_id: requestId,
    resolved_model: { provider: 'fixture', model: 'fixture', version: '1' },
    output: 'version: "0.2"',
    finish_reason: 'completed',
    usage: { input_tokens: input, cached_input_tokens: 0, output_tokens: output },
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
  return {
    schema_version: '0.2',
    run_id: `suite/task/atlaspec-maplibre/1/${variant}`,
    variant_id: variant,
    task_id: 'task',
    condition: 'atlaspec-maplibre',
    repetition: 1,
    compiler_commit: 'fixture',
    started_at: '2026-07-21T00:00:00.000Z',
    completed_at: '2026-07-21T00:00:01.000Z',
    first_attempt_accepted: responded,
    final_accepted: responded,
    repair_iterations: 0,
    attempts: [
      {
        stage: 'initial',
        request: {
          schema_version: '0.1',
          request_id: requestId,
          suite: 'suite',
          task_id: 'task',
          condition: 'atlaspec-maplibre',
          repetition: 1,
          attempt: 1,
          model: { provider: 'fixture', model: 'fixture', version: '1' },
          sampling: { temperature: 0 },
          prompt: 'fixture',
          prompt_sha256: '0'.repeat(64),
          inputs: [],
        },
        ...(responded ? { response } : { transport_error: 'fixture transport failure' }),
        checks: [],
        accepted: responded,
      },
    ],
    edit: responded
      ? {
          attempted: true,
          accepted: true,
          target_layer: 'layer',
          checks: [],
          changed_output_bytes: 1,
        }
      : null,
  };
}
