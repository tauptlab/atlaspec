import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';

const Strict = { additionalProperties: false } as const;

export const BenchmarkConditionSchema = Type.Union([
  Type.Literal('direct-maplibre'),
  Type.Literal('direct-vega-lite'),
  Type.Literal('atlaspec'),
  Type.Literal('atlaspec-repair'),
]);

export const ModelIdentitySchema = Type.Object(
  {
    provider: Type.String({ minLength: 1 }),
    model: Type.String({ minLength: 1 }),
    version: Type.String({ minLength: 1 }),
  },
  Strict,
);

export const SamplingSchema = Type.Object(
  {
    temperature: Type.Number({ minimum: 0 }),
    seed: Type.Optional(Type.Integer()),
    top_p: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 1 })),
    max_output_tokens: Type.Optional(Type.Integer({ minimum: 1 })),
    reasoning_effort: Type.Optional(
      Type.Union([
        Type.Literal('none'),
        Type.Literal('minimal'),
        Type.Literal('low'),
        Type.Literal('medium'),
        Type.Literal('high'),
        Type.Literal('xhigh'),
      ]),
    ),
  },
  Strict,
);

export const InputArtifactSchema = Type.Object(
  {
    path: Type.String({ minLength: 1 }),
    media_type: Type.String({ minLength: 1 }),
    content: Type.String(),
    sha256: Type.String({ pattern: '^[a-f0-9]{64}$' }),
  },
  Strict,
);

export const GenerationRequestSchema = Type.Object(
  {
    schema_version: Type.Literal('0.1'),
    request_id: Type.String({ minLength: 1 }),
    suite: Type.String({ minLength: 1 }),
    task_id: Type.String({ minLength: 1 }),
    condition: BenchmarkConditionSchema,
    repetition: Type.Integer({ minimum: 1 }),
    attempt: Type.Integer({ minimum: 1, maximum: 2 }),
    model: ModelIdentitySchema,
    sampling: SamplingSchema,
    prompt: Type.String({ minLength: 1 }),
    prompt_sha256: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    inputs: Type.Array(InputArtifactSchema),
    diagnostics: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  },
  Strict,
);

export const TokenUsageSchema = Type.Object(
  {
    input_tokens: Type.Integer({ minimum: 0 }),
    output_tokens: Type.Integer({ minimum: 0 }),
    cached_input_tokens: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  Strict,
);

export const PricingSchema = Type.Object(
  {
    currency: Type.Literal('USD'),
    input_usd_per_million: Type.Number({ minimum: 0 }),
    cached_input_usd_per_million: Type.Number({ minimum: 0 }),
    output_usd_per_million: Type.Number({ minimum: 0 }),
    source: Type.String({ minLength: 1 }),
  },
  Strict,
);

export const GenerationResponseSchema = Type.Object(
  {
    schema_version: Type.Literal('0.1'),
    request_id: Type.String({ minLength: 1 }),
    provider_request_id: Type.Optional(Type.String({ minLength: 1 })),
    resolved_model: ModelIdentitySchema,
    output: Type.String(),
    finish_reason: Type.String({ minLength: 1 }),
    usage: TokenUsageSchema,
    latency_ms: Type.Number({ minimum: 0 }),
    pricing: PricingSchema,
    charge_usd: Type.Number({ minimum: 0 }),
    tool_calls: Type.Integer({ minimum: 0 }),
  },
  Strict,
);

export const EvaluationCheckSchema = Type.Object(
  {
    code: Type.String({ minLength: 1 }),
    passed: Type.Boolean(),
    detail: Type.String(),
  },
  Strict,
);

export const AttemptRecordSchema = Type.Object(
  {
    request: GenerationRequestSchema,
    response: Type.Optional(GenerationResponseSchema),
    transport_error: Type.Optional(Type.String({ minLength: 1 })),
    checks: Type.Array(EvaluationCheckSchema),
    accepted: Type.Boolean(),
  },
  Strict,
);

export const RunRecordSchema = Type.Object(
  {
    schema_version: Type.Literal('0.1'),
    run_id: Type.String({ minLength: 1 }),
    compiler_commit: Type.String({ minLength: 1 }),
    started_at: Type.String({ format: 'date-time' }),
    completed_at: Type.String({ format: 'date-time' }),
    first_attempt_accepted: Type.Boolean(),
    final_accepted: Type.Boolean(),
    repair_iterations: Type.Integer({ minimum: 0, maximum: 1 }),
    attempts: Type.Array(AttemptRecordSchema, { minItems: 1, maxItems: 2 }),
  },
  Strict,
);

export type BenchmarkCondition = Static<typeof BenchmarkConditionSchema>;
export type ModelIdentity = Static<typeof ModelIdentitySchema>;
export type Sampling = Static<typeof SamplingSchema>;
export type InputArtifact = Static<typeof InputArtifactSchema>;
export type GenerationRequest = Static<typeof GenerationRequestSchema>;
export type GenerationResponse = Static<typeof GenerationResponseSchema>;
export type Pricing = Static<typeof PricingSchema>;
export type EvaluationCheck = Static<typeof EvaluationCheckSchema>;
export type AttemptRecord = Static<typeof AttemptRecordSchema>;
export type RunRecord = Static<typeof RunRecordSchema>;

export interface GenerationAdapter {
  generate(request: GenerationRequest): Promise<GenerationResponse>;
}
