import type {
  GenerationRequest,
  GenerationResponse,
  Pricing,
} from '../protocol.js';

export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface OpenAIAdapterEnvironment {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_ORGANIZATION?: string;
  OPENAI_PROJECT?: string;
  ATLASBENCH_OPENAI_INPUT_USD_PER_1M?: string;
  ATLASBENCH_OPENAI_CACHED_INPUT_USD_PER_1M?: string;
  ATLASBENCH_OPENAI_OUTPUT_USD_PER_1M?: string;
  ATLASBENCH_OPENAI_PRICING_SOURCE?: string;
  ATLASBENCH_OPENAI_TIMEOUT_MS?: string;
}

interface OpenAIResponseBody {
  id: string;
  status: string;
  model: string;
  output: unknown[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    input_tokens_details?: { cached_tokens?: number };
  };
  incomplete_details?: { reason?: string } | null;
}

export async function generateOpenAIResponse(
  request: GenerationRequest,
  environment: OpenAIAdapterEnvironment,
  fetchImplementation: FetchImplementation = fetch,
): Promise<GenerationResponse> {
  if (request.model.provider !== 'openai') {
    throw new Error(
      `OpenAI adapter requires model.provider=openai, received ${request.model.provider}.`,
    );
  }
  if (request.sampling.seed !== undefined) {
    throw new Error(
      'The OpenAI Responses adapter does not silently ignore seed; remove it from the manifest.',
    );
  }

  const apiKey = required(environment.OPENAI_API_KEY, 'OPENAI_API_KEY');
  const pricing = readPricing(environment);
  const timeoutMs = optionalNonNegativeNumber(
    environment.ATLASBENCH_OPENAI_TIMEOUT_MS,
    'ATLASBENCH_OPENAI_TIMEOUT_MS',
    110_000,
  );
  if (timeoutMs === 0) {
    throw new Error('ATLASBENCH_OPENAI_TIMEOUT_MS must be greater than zero.');
  }

  const started = performance.now();
  const response = await fetchImplementation(
    `${(environment.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/responses`,
    {
      method: 'POST',
      headers: requestHeaders(apiKey, environment),
      body: JSON.stringify(requestBody(request)),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const latencyMs = performance.now() - started;
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(
      `OpenAI Responses API failed with HTTP ${response.status}: ${safeError(raw)}`,
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`OpenAI response was not JSON: ${errorMessage(error)}`);
  }
  const body = parseResponseBody(value);
  if (body.model !== request.model.version) {
    throw new Error(
      `Resolved model mismatch: manifest version=${request.model.version} response model=${body.model}.`,
    );
  }

  const cachedInputTokens = body.usage.input_tokens_details?.cached_tokens ?? 0;
  if (cachedInputTokens > body.usage.input_tokens) {
    throw new Error('Cached input tokens exceed total input tokens.');
  }
  const charge = calculateCharge(
    body.usage.input_tokens,
    cachedInputTokens,
    body.usage.output_tokens,
    pricing,
  );

  return {
    schema_version: '0.1',
    request_id: request.request_id,
    provider_request_id: body.id,
    resolved_model: {
      provider: 'openai',
      model: body.model,
      version: body.model,
    },
    output: extractOutputText(body.output),
    finish_reason: finishReason(body),
    usage: {
      input_tokens: body.usage.input_tokens,
      output_tokens: body.usage.output_tokens,
      cached_input_tokens: cachedInputTokens,
    },
    latency_ms: latencyMs,
    pricing,
    charge_usd: charge,
    tool_calls: countToolCalls(body.output),
  };
}

function requestBody(request: GenerationRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model.model,
    store: false,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: request.prompt },
          ...request.inputs.map((input) => ({
            type: 'input_text',
            text: formatInput(input),
          })),
        ],
      },
    ],
    temperature: request.sampling.temperature,
    metadata: {
      atlasbench_request_id: request.request_id.slice(0, 512),
      atlasbench_condition: request.condition,
    },
  };
  if (request.sampling.top_p !== undefined) {
    body['top_p'] = request.sampling.top_p;
  }
  if (request.sampling.max_output_tokens !== undefined) {
    body['max_output_tokens'] = request.sampling.max_output_tokens;
  }
  if (request.sampling.reasoning_effort !== undefined) {
    body['reasoning'] = { effort: request.sampling.reasoning_effort };
  }
  return body;
}

function formatInput(input: GenerationRequest['inputs'][number]): string {
  return [
    `<atlasbench-input role=${JSON.stringify(input.role)} path=${JSON.stringify(input.path)} media-type=${JSON.stringify(input.media_type)} sha256=${JSON.stringify(input.sha256)}>`,
    input.content,
    '</atlasbench-input>',
  ].join('\n');
}

function requestHeaders(
  apiKey: string,
  environment: OpenAIAdapterEnvironment,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (environment.OPENAI_ORGANIZATION !== undefined) {
    headers['OpenAI-Organization'] = environment.OPENAI_ORGANIZATION;
  }
  if (environment.OPENAI_PROJECT !== undefined) {
    headers['OpenAI-Project'] = environment.OPENAI_PROJECT;
  }
  return headers;
}

function readPricing(environment: OpenAIAdapterEnvironment): Pricing {
  return {
    currency: 'USD',
    input_usd_per_million: requiredNonNegativeNumber(
      environment.ATLASBENCH_OPENAI_INPUT_USD_PER_1M,
      'ATLASBENCH_OPENAI_INPUT_USD_PER_1M',
    ),
    cached_input_usd_per_million: requiredNonNegativeNumber(
      environment.ATLASBENCH_OPENAI_CACHED_INPUT_USD_PER_1M,
      'ATLASBENCH_OPENAI_CACHED_INPUT_USD_PER_1M',
    ),
    output_usd_per_million: requiredNonNegativeNumber(
      environment.ATLASBENCH_OPENAI_OUTPUT_USD_PER_1M,
      'ATLASBENCH_OPENAI_OUTPUT_USD_PER_1M',
    ),
    source: required(
      environment.ATLASBENCH_OPENAI_PRICING_SOURCE,
      'ATLASBENCH_OPENAI_PRICING_SOURCE',
    ),
  };
}

function calculateCharge(
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
  pricing: Pricing,
): number {
  const uncachedInputTokens = inputTokens - cachedInputTokens;
  return (
    (uncachedInputTokens * pricing.input_usd_per_million +
      cachedInputTokens * pricing.cached_input_usd_per_million +
      outputTokens * pricing.output_usd_per_million) /
    1_000_000
  );
}

function parseResponseBody(value: unknown): OpenAIResponseBody {
  if (!isRecord(value)) throw new Error('OpenAI response must be an object.');
  const usage = value['usage'];
  if (!isRecord(usage)) throw new Error('OpenAI response is missing usage.');
  const body: OpenAIResponseBody = {
    id: requiredString(value['id'], 'response.id'),
    status: requiredString(value['status'], 'response.status'),
    model: requiredString(value['model'], 'response.model'),
    output: Array.isArray(value['output']) ? value['output'] : [],
    usage: {
      input_tokens: requiredTokenCount(
        usage['input_tokens'],
        'usage.input_tokens',
      ),
      output_tokens: requiredTokenCount(
        usage['output_tokens'],
        'usage.output_tokens',
      ),
    },
  };
  const details = usage['input_tokens_details'];
  if (isRecord(details) && details['cached_tokens'] !== undefined) {
    body.usage.input_tokens_details = {
      cached_tokens: requiredTokenCount(
        details['cached_tokens'],
        'usage.input_tokens_details.cached_tokens',
      ),
    };
  }
  const incomplete = value['incomplete_details'];
  if (isRecord(incomplete) && typeof incomplete['reason'] === 'string') {
    body.incomplete_details = { reason: incomplete['reason'] };
  }
  return body;
}

function extractOutputText(output: readonly unknown[]): string {
  const parts: string[] = [];
  for (const item of output) {
    if (!isRecord(item) || item['type'] !== 'message') continue;
    const content = item['content'];
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (
        isRecord(part) &&
        part['type'] === 'output_text' &&
        typeof part['text'] === 'string'
      ) {
        parts.push(part['text']);
      }
    }
  }
  return parts.join('\n');
}

function countToolCalls(output: readonly unknown[]): number {
  return output.filter(
    (item) =>
      isRecord(item) &&
      typeof item['type'] === 'string' &&
      (item['type'] === 'function_call' || item['type'].endsWith('_call')),
  ).length;
}

function finishReason(body: OpenAIResponseBody): string {
  const reason = body.incomplete_details?.reason;
  return reason === undefined ? body.status : `${body.status}:${reason}`;
}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function requiredNonNegativeNumber(
  value: string | undefined,
  name: string,
): number {
  return optionalNonNegativeNumber(value, name, undefined);
}

function optionalNonNegativeNumber(
  value: string | undefined,
  name: string,
  fallback: number | undefined,
): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
  return parsed;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}

function requiredTokenCount(value: unknown, name: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value as number;
}

function safeError(raw: string): string {
  return raw.slice(0, 4_096).replaceAll(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
