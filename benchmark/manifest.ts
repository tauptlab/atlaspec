import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';

const Strict = { additionalProperties: false } as const;

const FamilySchema = Type.Union([
  Type.Literal('choropleth'),
  Type.Literal('proportional-symbol'),
  Type.Literal('categorical-point'),
  Type.Literal('heatmap'),
]);

export const BenchmarkTaskSchema = Type.Object(
  {
    id: Type.String({
      minLength: 1,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    }),
    family: FamilySchema,
    artifact: Type.String({ minLength: 1 }),
    required_layer_types: Type.Array(Type.String({ minLength: 1 }), {
      uniqueItems: true,
    }),
    required_decisions: Type.Array(Type.String({ minLength: 1 }), {
      uniqueItems: true,
    }),
  },
  Strict,
);

export const BenchmarkManifestSchema = Type.Object(
  {
    version: Type.Literal('0.1'),
    suite: Type.String({ minLength: 1 }),
    tasks: Type.Array(BenchmarkTaskSchema, { minItems: 1 }),
  },
  Strict,
);

export type BenchmarkTask = Static<typeof BenchmarkTaskSchema>;
export type BenchmarkManifest = Static<typeof BenchmarkManifestSchema>;

export interface BenchmarkCheck {
  code: string;
  passed: boolean;
  detail: string;
}

export interface BenchmarkTaskResult {
  task_id: string;
  accepted: boolean;
  checks: BenchmarkCheck[];
}

export interface BenchmarkReport {
  schema_version: '0.1';
  suite: string;
  condition: 'atlaspec-fixture';
  compiler_commit: string;
  node_version: string;
  generated_at: string;
  attempted: number;
  accepted: number;
  reliable_map_yield: number;
  results: BenchmarkTaskResult[];
}
