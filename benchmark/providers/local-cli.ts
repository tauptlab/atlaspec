import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type {
  GenerationRequest,
  GenerationResponse,
} from '../protocol.js';

export interface ProcessResult {
  stdout: string;
  stderr: string;
  duration_ms: number;
}

export async function generateCodexCliResponse(
  request: GenerationRequest,
): Promise<GenerationResponse> {
  assertProvider(request, 'codex-cli');
  assertSafeModel(request.model.model);
  const command = process.env['ATLASBENCH_CODEX_COMMAND'] ?? 'codex';
  const versionResult = await runProcess(command, ['--version'], '');
  const cliVersion = versionResult.stdout.trim();
  const resolvedVersion = `${cliVersion};model=unreported`;
  if (request.model.version !== resolvedVersion) {
    throw new Error(
      `Codex CLI version mismatch: manifest=${request.model.version} actual=${resolvedVersion}.`,
    );
  }

  const directory = await mkdtemp(join(tmpdir(), 'atlasbench-codex-'));
  try {
    const args = [
      'exec',
      '--ephemeral',
      '--ignore-user-config',
      '--ignore-rules',
      '--sandbox',
      'read-only',
      '--skip-git-repo-check',
      '--color',
      'never',
      '--json',
      '--cd',
      directory,
    ];
    if (request.model.model !== 'default') {
      args.push('--model', request.model.model);
    }
    args.push('-');
    const result = await runProcess(command, args, formatCliPrompt(request));
    return parseCodexOutput(request, cliVersion, result);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function generateClaudeCliResponse(
  request: GenerationRequest,
): Promise<GenerationResponse> {
  assertProvider(request, 'claude-cli');
  assertSafeModel(request.model.model);
  const invocation = await claudeInvocation();
  const versionResult = await runProcess(
    invocation.executable,
    [...invocation.prefixArgs, '--version'],
    '',
  );
  const cliVersion = versionResult.stdout.trim();
  const maxBudget = positiveNumber(
    process.env['ATLASBENCH_CLAUDE_MAX_BUDGET_USD'] ?? '0.25',
    'ATLASBENCH_CLAUDE_MAX_BUDGET_USD',
  );
  const result = await runProcess(
    invocation.executable,
    [
      ...invocation.prefixArgs,
      '--print',
      '--no-session-persistence',
      '--tools',
      '',
      '--permission-mode',
      'dontAsk',
      '--disable-slash-commands',
      '--no-chrome',
      '--output-format',
      'json',
      '--max-budget-usd',
      String(maxBudget),
      '--model',
      request.model.model,
    ],
    formatCliPrompt(request),
  );
  return parseClaudeOutput(request, cliVersion, result);
}

export function parseCodexOutput(
  request: GenerationRequest,
  cliVersion: string,
  result: ProcessResult,
): GenerationResponse {
  let output = '';
  let inputTokens: number | undefined;
  let cachedInputTokens = 0;
  let outputTokens: number | undefined;
  const toolIds = new Set<string>();
  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(event)) continue;
    if (event['type'] === 'item.completed' && isRecord(event['item'])) {
      const item = event['item'];
      if (item['type'] === 'agent_message' && typeof item['text'] === 'string') {
        output = item['text'];
      } else if (
        typeof item['id'] === 'string' &&
        item['type'] !== 'reasoning'
      ) {
        toolIds.add(item['id']);
      }
    }
    if (event['type'] === 'turn.completed' && isRecord(event['usage'])) {
      const usage = event['usage'];
      inputTokens = tokenCount(usage['input_tokens'], 'input_tokens');
      cachedInputTokens = tokenCount(
        usage['cached_input_tokens'] ?? 0,
        'cached_input_tokens',
      );
      outputTokens = tokenCount(usage['output_tokens'], 'output_tokens');
    }
  }
  if (inputTokens === undefined || outputTokens === undefined) {
    throw new Error('Codex CLI JSONL did not include turn.completed usage.');
  }
  const resolvedVersion = `${cliVersion};model=unreported`;
  return {
    schema_version: '0.1',
    request_id: request.request_id,
    resolved_model: {
      provider: 'codex-cli',
      model: request.model.model,
      version: resolvedVersion,
    },
    output,
    finish_reason: 'completed',
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cached_input_tokens: cachedInputTokens,
    },
    latency_ms: result.duration_ms,
    pricing: {
      currency: 'USD',
      input_usd_per_million: 0,
      cached_input_usd_per_million: 0,
      output_usd_per_million: 0,
      source: `${cliVersion} does not report monetary cost or resolved model`,
    },
    cost_observed: false,
    charge_source: 'unavailable from Codex CLI JSONL',
    charge_usd: 0,
    tool_calls: toolIds.size,
  };
}

export function parseClaudeOutput(
  request: GenerationRequest,
  cliVersion: string,
  result: ProcessResult,
): GenerationResponse {
  const value = JSON.parse(result.stdout) as unknown;
  if (!isRecord(value)) throw new Error('Claude CLI output must be an object.');
  const modelUsage = value['modelUsage'];
  if (!isRecord(modelUsage)) throw new Error('Claude CLI omitted modelUsage.');
  const models = Object.keys(modelUsage);
  if (models.length !== 1) {
    throw new Error(`Claude CLI used ${models.length} models; exactly one is required.`);
  }
  const model = models[0]!;
  if (model !== request.model.version) {
    throw new Error(
      `Claude model mismatch: manifest=${request.model.version} actual=${model}.`,
    );
  }
  const usage = value['usage'];
  if (!isRecord(usage)) throw new Error('Claude CLI omitted usage.');
  const directInput = tokenCount(usage['input_tokens'] ?? 0, 'input_tokens');
  const cacheCreation = tokenCount(
    usage['cache_creation_input_tokens'] ?? 0,
    'cache_creation_input_tokens',
  );
  const cacheRead = tokenCount(
    usage['cache_read_input_tokens'] ?? 0,
    'cache_read_input_tokens',
  );
  const outputTokens = tokenCount(usage['output_tokens'] ?? 0, 'output_tokens');
  const cost = nonNegativeNumber(value['total_cost_usd'], 'total_cost_usd');
  return {
    schema_version: '0.1',
    request_id: request.request_id,
    ...(typeof value['session_id'] === 'string'
      ? { provider_request_id: value['session_id'] }
      : {}),
    resolved_model: { provider: 'claude-cli', model, version: model },
    output: typeof value['result'] === 'string' ? value['result'] : '',
    finish_reason:
      typeof value['subtype'] === 'string' ? value['subtype'] : 'unknown',
    usage: {
      input_tokens: directInput + cacheCreation + cacheRead,
      output_tokens: outputTokens,
      cached_input_tokens: cacheRead,
    },
    latency_ms:
      typeof value['duration_ms'] === 'number'
        ? value['duration_ms']
        : result.duration_ms,
    pricing: {
      currency: 'USD',
      input_usd_per_million: 0,
      cached_input_usd_per_million: 0,
      output_usd_per_million: 0,
      source: `Claude Code ${cliVersion} provider-reported total_cost_usd`,
    },
    cost_observed: true,
    charge_source: 'Claude CLI result.total_cost_usd',
    charge_usd: cost,
    tool_calls: serverToolCalls(usage['server_tool_use']),
  };
}

export function formatCliPrompt(request: GenerationRequest): string {
  return [
    'Do not use tools, inspect the filesystem, or add commentary.',
    request.prompt,
    ...request.inputs.map((input) =>
      [
        `<atlasbench-input role=${JSON.stringify(input.role)} path=${JSON.stringify(input.path)} media-type=${JSON.stringify(input.media_type)} sha256=${JSON.stringify(input.sha256)}>`,
        input.content,
        '</atlasbench-input>',
      ].join('\n'),
    ),
  ].join('\n\n');
}

export async function runProcess(
  executable: string,
  args: readonly string[],
  stdin: string,
  timeoutMs = 110_000,
): Promise<ProcessResult> {
  const started = performance.now();
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error !== undefined) reject(error);
      else {
        resolve({
          stdout: Buffer.concat(stdout).toString('utf8').trim(),
          stderr: Buffer.concat(stderr).toString('utf8').trim(),
          duration_ms: performance.now() - started,
        });
      }
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error(`Local CLI timed out after ${timeoutMs} ms.`));
    }, timeoutMs);
    child.once('error', (error) => finish(error));
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 20 * 1024 * 1024) {
        child.kill();
        finish(new Error('Local CLI stdout exceeded 20 MiB.'));
      } else stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (Buffer.concat(stderr).length < 1024 * 1024) stderr.push(chunk);
    });
    child.once('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(
          new Error(
            `Local CLI exited with code ${String(code)}: ${Buffer.concat(stderr).toString('utf8').trim()}`,
          ),
        );
      } else finish();
    });
    child.stdin.once('error', (error) => finish(error));
    child.stdin.end(stdin);
  });
}

async function claudeInvocation(): Promise<{
  executable: string;
  prefixArgs: string[];
}> {
  const explicit = process.env['ATLASBENCH_CLAUDE_ENTRYPOINT'];
  if (explicit !== undefined) {
    return { executable: process.execPath, prefixArgs: [explicit] };
  }
  if (process.platform !== 'win32') {
    return { executable: 'claude', prefixArgs: [] };
  }
  const located = await runProcess('where.exe', ['claude.cmd'], '');
  const shim = located.stdout.split(/\r?\n/)[0];
  if (shim === undefined || shim === '') throw new Error('Cannot locate claude.cmd.');
  return {
    executable: process.execPath,
    prefixArgs: [
      join(dirname(shim), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
    ],
  };
}

function assertProvider(request: GenerationRequest, provider: string): void {
  if (request.model.provider !== provider) {
    throw new Error(`Expected model.provider=${provider}.`);
  }
}

function assertSafeModel(model: string): void {
  if (!/^[a-zA-Z0-9._:-]+$/.test(model)) {
    throw new Error('Model ID contains unsupported command characters.');
  }
}

function tokenCount(value: unknown, name: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value as number;
}

function nonNegativeNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }
  return value;
}

function positiveNumber(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
}

function serverToolCalls(value: unknown): number {
  if (!isRecord(value)) return 0;
  return Object.values(value).reduce<number>(
    (total, count) => total + (typeof count === 'number' ? count : 0),
    0,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
