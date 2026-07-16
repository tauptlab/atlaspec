import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { Ajv } from 'ajv';

import {
  GenerationResponseSchema,
  type GenerationAdapter,
  type GenerationRequest,
  type GenerationResponse,
} from './protocol.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateResponse = ajv.compile<GenerationResponse>(
  GenerationResponseSchema,
);

export interface CommandAdapterOptions {
  executable: string;
  args?: readonly string[];
  timeout_ms?: number;
  max_output_bytes?: number;
}

export class AdapterError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AdapterError';
  }
}

export class CommandGenerationAdapter implements GenerationAdapter {
  readonly #executable: string;
  readonly #args: readonly string[];
  readonly #timeoutMs: number;
  readonly #maxOutputBytes: number;

  public constructor(options: CommandAdapterOptions) {
    if (options.executable.trim() === '') {
      throw new AdapterError('Adapter executable must not be empty.');
    }
    this.#executable = options.executable;
    this.#args = options.args ?? [];
    this.#timeoutMs = options.timeout_ms ?? 120_000;
    this.#maxOutputBytes = options.max_output_bytes ?? 10 * 1024 * 1024;
  }

  public async generate(
    request: GenerationRequest,
  ): Promise<GenerationResponse> {
    const raw = await executeAdapter(
      this.#executable,
      this.#args,
      `${JSON.stringify(request)}\n`,
      this.#timeoutMs,
      this.#maxOutputBytes,
    );

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      throw new AdapterError(
        `Adapter stdout is not one JSON response: ${errorMessage(error)}`,
      );
    }
    return assertResponse(value, request.request_id);
  }
}

export class ReplayGenerationAdapter implements GenerationAdapter {
  readonly #responses: ReadonlyMap<string, GenerationResponse>;

  public constructor(responses: readonly GenerationResponse[]) {
    const indexed = new Map<string, GenerationResponse>();
    for (const response of responses) {
      const validated = assertResponse(response, response.request_id);
      if (indexed.has(validated.request_id)) {
        throw new AdapterError(
          `Duplicate replay request_id: ${validated.request_id}`,
        );
      }
      indexed.set(validated.request_id, validated);
    }
    this.#responses = indexed;
  }

  public static async fromFile(path: string): Promise<ReplayGenerationAdapter> {
    let value: unknown;
    try {
      value = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      throw new AdapterError(`Cannot load replay file: ${errorMessage(error)}`);
    }
    if (!Array.isArray(value)) {
      throw new AdapterError('Replay file must contain a JSON array.');
    }
    return new ReplayGenerationAdapter(value as GenerationResponse[]);
  }

  public async generate(
    request: GenerationRequest,
  ): Promise<GenerationResponse> {
    const response = this.#responses.get(request.request_id);
    if (response === undefined) {
      throw new AdapterError(
        `Replay has no response for request_id: ${request.request_id}`,
      );
    }
    return structuredClone(response);
  }
}

function assertResponse(
  value: unknown,
  expectedRequestId: string,
): GenerationResponse {
  if (!validateResponse(value)) {
    throw new AdapterError(
      `Adapter response violates the protocol: ${ajv.errorsText(validateResponse.errors)}`,
    );
  }
  if (value.request_id !== expectedRequestId) {
    throw new AdapterError(
      `Adapter response request_id mismatch: expected=${expectedRequestId} actual=${value.request_id}`,
    );
  }
  return value;
}

async function executeAdapter(
  executable: string,
  args: readonly string[],
  stdin: string,
  timeoutMs: number,
  maxOutputBytes: number,
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const finish = (error?: Error, output?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error !== undefined) reject(error);
      else resolve(output ?? '');
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(new AdapterError(`Adapter timed out after ${timeoutMs} ms.`));
    }, timeoutMs);

    child.once('error', (error) => {
      finish(new AdapterError(`Cannot start adapter: ${error.message}`));
    });
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxOutputBytes) {
        child.kill();
        finish(
          new AdapterError(
            `Adapter stdout exceeded ${maxOutputBytes} bytes.`,
          ),
        );
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= maxOutputBytes) stderr.push(chunk);
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      const errorOutput = Buffer.concat(stderr).toString('utf8').trim();
      if (code !== 0) {
        finish(
          new AdapterError(
            `Adapter exited with code=${String(code)} signal=${String(signal)}` +
              (errorOutput === '' ? '' : `: ${errorOutput}`),
          ),
        );
        return;
      }
      finish(undefined, Buffer.concat(stdout).toString('utf8').trim());
    });

    child.stdin.once('error', (error) => {
      finish(new AdapterError(`Cannot write adapter request: ${error.message}`));
    });
    child.stdin.end(stdin);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
