import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';

import {
  GenerationRequestSchema,
  GenerationResponseSchema,
  RunRecordSchema,
} from './protocol.js';

const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addFormat('date-time', {
  validate: (value: string) => !Number.isNaN(Date.parse(value)),
});

describe('AtlasBench comparative protocol', () => {
  it('accepts a complete auditable run record', () => {
    const validate = ajv.compile(RunRecordSchema);
    const request = validRequest();
    const response = validResponse();

    expect(
      validate({
        schema_version: '0.1',
        run_id: 'task-a:atlaspec:1',
        compiler_commit: 'abc123',
        started_at: '2026-07-16T00:00:00.000Z',
        completed_at: '2026-07-16T00:00:01.000Z',
        first_attempt_accepted: true,
        final_accepted: true,
        repair_iterations: 0,
        attempts: [
          {
            request,
            response,
            checks: [
              { code: 'artifact.parse', passed: true, detail: 'parsed' },
            ],
            accepted: true,
          },
        ],
      }),
    ).toBe(true);
  });

  it('rejects unaccounted usage and malformed digests', () => {
    const validateRequest = ajv.compile(GenerationRequestSchema);
    const validateResponse = ajv.compile(GenerationResponseSchema);

    expect(
      validateRequest({ ...validRequest(), prompt_sha256: 'not-a-digest' }),
    ).toBe(false);
    expect(
      validateResponse({
        ...validResponse(),
        usage: { input_tokens: 12, output_tokens: -1 },
      }),
    ).toBe(false);
    expect(
      validateResponse({ ...validResponse(), undocumented_cost: 0 }),
    ).toBe(false);
  });
});

function validRequest() {
  return {
    schema_version: '0.1',
    request_id: 'task-a:atlaspec:1:1',
    suite: 'comparison-pilot',
    task_id: 'task-a',
    condition: 'atlaspec',
    repetition: 1,
    attempt: 1,
    model: { provider: 'fixture', model: 'replay', version: '1' },
    sampling: { temperature: 0 },
    prompt: 'Create the requested map.',
    prompt_sha256:
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    inputs: [
      {
        path: 'data.geojson',
        media_type: 'application/geo+json',
        content: '{"type":"FeatureCollection","features":[]}',
        sha256:
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
    ],
  };
}

function validResponse() {
  return {
    schema_version: '0.1',
    request_id: 'task-a:atlaspec:1:1',
    resolved_model: { provider: 'fixture', model: 'replay', version: '1' },
    output: 'version: "0.1"',
    finish_reason: 'stop',
    usage: { input_tokens: 12, output_tokens: 6 },
    latency_ms: 25,
    pricing: {
      currency: 'USD',
      input_usd_per_million: 1,
      cached_input_usd_per_million: 0.1,
      output_usd_per_million: 2,
      source: 'test fixture',
    },
    charge_usd: 0.0001,
    tool_calls: 0,
  };
}
