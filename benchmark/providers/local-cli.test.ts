import { describe, expect, it } from 'vitest';

import type { GenerationRequest } from '../protocol.js';
import {
  formatCliPrompt,
  parseClaudeOutput,
  parseCodexOutput,
} from './local-cli.js';

describe('local agent CLI adapters', () => {
  it('parses Codex JSONL while marking monetary cost unavailable', () => {
    const request = fixtureRequest('codex-cli', 'default', 'codex-cli 0.144.4;model=unreported');
    const stdout = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread' }),
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'message', type: 'agent_message', text: 'version: "0.1"' },
      }),
      JSON.stringify({
        type: 'turn.completed',
        usage: {
          input_tokens: 1000,
          cached_input_tokens: 700,
          output_tokens: 20,
        },
      }),
    ].join('\n');

    const response = parseCodexOutput(request, 'codex-cli 0.144.4', {
      stdout,
      stderr: '',
      duration_ms: 50,
    });
    expect(response).toEqual(
      expect.objectContaining({
        output: 'version: "0.1"',
        cost_observed: false,
        charge_usd: 0,
        usage: {
          input_tokens: 1000,
          cached_input_tokens: 700,
          output_tokens: 20,
        },
      }),
    );
  });

  it('parses Claude cache usage, actual model, and reported charge', () => {
    const request = fixtureRequest(
      'claude-cli',
      'opus',
      'claude-opus-4-5-20251101',
    );
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: '{"version":"0.1"}',
      session_id: 'session',
      duration_ms: 75,
      total_cost_usd: 0.012,
      usage: {
        input_tokens: 10,
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 900,
        output_tokens: 30,
        server_tool_use: { web_search_requests: 0 },
      },
      modelUsage: {
        'claude-opus-4-5-20251101': { inputTokens: 10 },
      },
    });

    const response = parseClaudeOutput(request, '2.1.17 (Claude Code)', {
      stdout,
      stderr: '',
      duration_ms: 80,
    });
    expect(response).toEqual(
      expect.objectContaining({
        resolved_model: {
          provider: 'claude-cli',
          model: 'claude-opus-4-5-20251101',
          version: 'claude-opus-4-5-20251101',
        },
        cost_observed: true,
        charge_usd: 0.012,
        usage: {
          input_tokens: 1010,
          cached_input_tokens: 900,
          output_tokens: 30,
        },
      }),
    );
  });

  it('includes declared data and reference inputs in the agent prompt', () => {
    const prompt = formatCliPrompt(
      fixtureRequest('codex-cli', 'default', 'version'),
    );
    expect(prompt).toContain('Do not use tools');
    expect(prompt).toContain('role="data"');
    expect(prompt).toContain('FeatureCollection');
    expect(prompt).toContain('The response must begin with version:');
    expect(prompt.endsWith('--- marker.')).toBe(true);
  });

  it('puts a fence-free JSON contract after all inputs for direct formats', () => {
    const request = fixtureRequest('claude-cli', 'opus', 'version');
    request.condition = 'direct-maplibre';
    const prompt = formatCliPrompt(request);
    expect(prompt).toContain('The first character of the response must be {');
    expect(prompt.endsWith('prose, or headings.')).toBe(true);
    expect(prompt.lastIndexOf('FINAL OUTPUT CONTRACT')).toBeGreaterThan(
      prompt.lastIndexOf('</atlasbench-input>'),
    );
  });

  it('can place a static reference before the task prompt for cache experiments', () => {
    const request = fixtureRequest('claude-cli', 'opus', 'version');
    request.prompt_layout = 'reference-task-data';
    request.inputs.push({
      path: 'reference.md',
      role: 'reference',
      media_type: 'text/markdown',
      content: 'STATIC REFERENCE',
      sha256: 'c'.repeat(64),
    });

    const prompt = formatCliPrompt(request);

    expect(prompt.indexOf('STATIC REFERENCE')).toBeLessThan(
      prompt.indexOf('Return an artifact only.'),
    );
    expect(prompt.indexOf('Return an artifact only.')).toBeLessThan(
      prompt.indexOf('FeatureCollection'),
    );
  });
});

function fixtureRequest(
  provider: string,
  model: string,
  version: string,
): GenerationRequest {
  return {
    schema_version: '0.1',
    request_id: 'local-pilot/task/atlaspec/1/1',
    suite: 'local-pilot',
    task_id: 'task',
    condition: 'atlaspec',
    repetition: 1,
    attempt: 1,
    model: { provider, model, version },
    sampling: { temperature: 0, max_output_tokens: 8000 },
    prompt: 'Return an artifact only.',
    prompt_sha256:
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    inputs: [
      {
        path: 'data.geojson',
        role: 'data',
        media_type: 'application/geo+json',
        content: '{"type":"FeatureCollection","features":[]}',
        sha256:
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
    ],
  };
}
