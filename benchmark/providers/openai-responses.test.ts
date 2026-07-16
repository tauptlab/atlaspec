import { describe, expect, it } from 'vitest';

import type { GenerationRequest } from '../protocol.js';
import {
  generateOpenAIResponse,
  type FetchImplementation,
  type OpenAIAdapterEnvironment,
} from './openai-responses.js';

describe('OpenAI Responses generation adapter', () => {
  it('extracts message text without assuming the first output item and locks cost', async () => {
    let capturedInput: string | URL | Request | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchMock: FetchImplementation = async (input, init) => {
      capturedInput = input;
      capturedInit = init;
      return new Response(
        JSON.stringify({
          id: 'resp_test',
          status: 'completed',
          model: 'gpt-test-2026-07-16',
          output: [
            { type: 'reasoning', id: 'rs_test' },
            {
              type: 'message',
              content: [
                { type: 'output_text', text: 'version: "0.1"' },
                { type: 'output_text', text: 'map: test-map' },
              ],
            },
            { type: 'function_call', name: 'unexpected' },
          ],
          usage: {
            input_tokens: 100,
            input_tokens_details: { cached_tokens: 20 },
            output_tokens: 40,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const response = await generateOpenAIResponse(
      request(),
      environment(),
      fetchMock,
    );

    expect(response).toEqual(
      expect.objectContaining({
        provider_request_id: 'resp_test',
        resolved_model: {
          provider: 'openai',
          model: 'gpt-test-2026-07-16',
          version: 'gpt-test-2026-07-16',
        },
        output: 'version: "0.1"\nmap: test-map',
        finish_reason: 'completed',
        usage: {
          input_tokens: 100,
          output_tokens: 40,
          cached_input_tokens: 20,
        },
        pricing: {
          currency: 'USD',
          input_usd_per_million: 2,
          cached_input_usd_per_million: 0.5,
          output_usd_per_million: 8,
          source: 'locked test price card',
        },
        charge_usd: 0.00049,
        tool_calls: 1,
      }),
    );

    expect(capturedInput).toBe('https://example.test/v1/responses');
    expect(capturedInit?.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer test-key' }),
    );
    const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
    expect(body).toEqual(
      expect.objectContaining({
        model: 'gpt-test',
        store: false,
        temperature: 0,
        top_p: 0.9,
        max_output_tokens: 4000,
        reasoning: { effort: 'low' },
      }),
    );
    expect(JSON.stringify(body)).toContain('districts.geojson');
    expect(JSON.stringify(body)).toContain('FeatureCollection');
  });

  it('fails closed when the provider resolves an undeclared model version', async () => {
    const fetchMock: FetchImplementation = async () =>
      new Response(
        JSON.stringify({
          id: 'resp_test',
          status: 'completed',
          model: 'different-version',
          output: [],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200 },
      );

    await expect(
      generateOpenAIResponse(request(), environment(), fetchMock),
    ).rejects.toThrow('Resolved model mismatch');
  });

  it('rejects unsupported sampling and incomplete price configuration before calling', async () => {
    let calls = 0;
    const fetchMock: FetchImplementation = async () => {
      calls += 1;
      throw new Error('fetch should not be called');
    };
    await expect(
      generateOpenAIResponse(
        { ...request(), sampling: { temperature: 0, seed: 42 } },
        environment(),
        fetchMock,
      ),
    ).rejects.toThrow('does not silently ignore seed');
    const incompleteEnvironment = environment();
    delete incompleteEnvironment.ATLASBENCH_OPENAI_OUTPUT_USD_PER_1M;
    await expect(
      generateOpenAIResponse(
        request(),
        incompleteEnvironment,
        fetchMock,
      ),
    ).rejects.toThrow('ATLASBENCH_OPENAI_OUTPUT_USD_PER_1M is required');
    expect(calls).toBe(0);
  });
});

function request(): GenerationRequest {
  return {
    schema_version: '0.1',
    request_id: 'suite/task/atlaspec/1/1',
    suite: 'suite',
    task_id: 'task',
    condition: 'atlaspec',
    repetition: 1,
    attempt: 1,
    model: {
      provider: 'openai',
      model: 'gpt-test',
      version: 'gpt-test-2026-07-16',
    },
    sampling: {
      temperature: 0,
      top_p: 0.9,
      max_output_tokens: 4000,
      reasoning_effort: 'low',
    },
    prompt: 'Return only Atlaspec YAML.',
    prompt_sha256:
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    inputs: [
      {
        path: 'districts.geojson',
        role: 'data',
        media_type: 'application/geo+json',
        content: '{"type":"FeatureCollection","features":[]}',
        sha256:
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
    ],
  };
}

function environment(): OpenAIAdapterEnvironment {
  return {
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: 'https://example.test/v1/',
    ATLASBENCH_OPENAI_INPUT_USD_PER_1M: '2',
    ATLASBENCH_OPENAI_CACHED_INPUT_USD_PER_1M: '0.5',
    ATLASBENCH_OPENAI_OUTPUT_USD_PER_1M: '8',
    ATLASBENCH_OPENAI_PRICING_SOURCE: 'locked test price card',
  };
}
