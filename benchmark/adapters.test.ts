import { describe, expect, it } from 'vitest';

import {
  AdapterError,
  CommandGenerationAdapter,
  ReplayGenerationAdapter,
} from './adapters.js';
import type {
  GenerationRequest,
  GenerationResponse,
} from './protocol.js';

describe('AtlasBench generation adapters', () => {
  it('replays only the response with the exact request id', async () => {
    const response = validResponse();
    const adapter = new ReplayGenerationAdapter([response]);

    await expect(adapter.generate(validRequest())).resolves.toEqual(response);
    await expect(
      adapter.generate({ ...validRequest(), request_id: 'missing' }),
    ).rejects.toThrow('Replay has no response');
  });

  it('rejects duplicate replay identifiers', () => {
    const response = validResponse();
    expect(
      () => new ReplayGenerationAdapter([response, response]),
    ).toThrow('Duplicate replay request_id');
  });

  it('exchanges one protocol response with a command adapter', async () => {
    const script = [
      "let input = '';",
      "process.stdin.on('data', chunk => input += chunk);",
      "process.stdin.on('end', () => {",
      '  const request = JSON.parse(input);',
      '  process.stdout.write(JSON.stringify({',
      "    schema_version: '0.1', request_id: request.request_id,",
      "    output: '{}', finish_reason: 'stop',",
      '    usage: { input_tokens: 10, output_tokens: 2 },',
      '    latency_ms: 3, charge_usd: 0, tool_calls: 0',
      '  }));',
      '});',
    ].join('\n');
    const adapter = new CommandGenerationAdapter({
      executable: process.execPath,
      args: ['-e', script],
      timeout_ms: 5_000,
    });

    await expect(adapter.generate(validRequest())).resolves.toEqual(
      expect.objectContaining({
        request_id: 'task-a:atlaspec:1:1',
        output: '{}',
      }),
    );
  });

  it('fails closed on command output outside the protocol', async () => {
    const adapter = new CommandGenerationAdapter({
      executable: process.execPath,
      args: ['-e', "process.stdout.write('not json')"],
      timeout_ms: 5_000,
    });

    await expect(adapter.generate(validRequest())).rejects.toBeInstanceOf(
      AdapterError,
    );
  });
});

function validRequest(): GenerationRequest {
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

function validResponse(): GenerationResponse {
  return {
    schema_version: '0.1',
    request_id: 'task-a:atlaspec:1:1',
    output: 'version: "0.1"',
    finish_reason: 'stop',
    usage: { input_tokens: 12, output_tokens: 6 },
    latency_ms: 25,
    charge_usd: 0.0001,
    tool_calls: 0,
  };
}
