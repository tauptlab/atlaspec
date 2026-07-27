import type { V02ExperimentReport, V02RunRecord } from '../experiment.js';
import type { V02Condition } from '../manifest.js';

interface RepairComparisonDefinition {
  renderer: 'maplibre' | 'vega-lite';
  direct: V02Condition;
  atlaspec: V02Condition;
}

export interface SymmetricRepairComparison {
  renderer: RepairComparisonDefinition['renderer'];
  direct_condition: V02Condition;
  atlaspec_condition: V02Condition;
  paired_runs: number;
  direct_first_attempt_yield: number;
  atlaspec_first_attempt_yield: number;
  direct_final_yield: number;
  atlaspec_final_yield: number;
  final_yield_delta: number;
  final_yield_delta_ci_95: [number, number];
  direct_repair_rate: number;
  atlaspec_repair_rate: number;
  direct_output_tokens_per_run: number;
  atlaspec_output_tokens_per_run: number;
  output_token_reduction: number;
  direct_latency_ms_per_run: number;
  atlaspec_latency_ms_per_run: number;
  latency_reduction: number;
  direct_charge_usd_per_run: number | null;
  atlaspec_charge_usd_per_run: number | null;
  charge_reduction: number | null;
}

export interface SymmetricRepairAnalysis {
  schema_version: '0.2-rnd';
  status: 'research-diagnostic-not-release-evidence';
  source_suite: string;
  source_model: V02ExperimentReport['model'];
  comparisons: SymmetricRepairComparison[];
  caveats: string[];
}

const DEFINITIONS: readonly RepairComparisonDefinition[] = [
  {
    renderer: 'maplibre',
    direct: 'direct-maplibre-repair',
    atlaspec: 'atlaspec-maplibre-repair',
  },
  {
    renderer: 'vega-lite',
    direct: 'direct-vega-lite-repair',
    atlaspec: 'atlaspec-vega-lite-repair',
  },
];

export function analyzeSymmetricRepair(
  report: V02ExperimentReport,
): SymmetricRepairAnalysis {
  const comparisons = DEFINITIONS.flatMap((definition) => {
    const pairs = pairRuns(report.runs, definition);
    return pairs.length === 0 ? [] : [comparison(definition, pairs)];
  });
  return {
    schema_version: '0.2-rnd',
    status: 'research-diagnostic-not-release-evidence',
    source_suite: report.suite,
    source_model: report.model,
    comparisons,
    caveats: [
      'The same deterministic failed checks and maximum one repair are used for both sides.',
      'Conditions must be compared only within the same agent, model identity, task, and repetition.',
      'This analysis does not replace a sealed holdout or independent external review.',
    ],
  };
}

interface Pair {
  direct: V02RunRecord;
  atlaspec: V02RunRecord;
}

function pairRuns(
  runs: readonly V02RunRecord[],
  definition: RepairComparisonDefinition,
): Pair[] {
  const direct = new Map<string, V02RunRecord>();
  const atlaspec = new Map<string, V02RunRecord>();
  for (const run of runs) {
    const key = `${run.task_id}/${run.repetition}`;
    if (run.condition === definition.direct) direct.set(key, run);
    if (run.condition === definition.atlaspec) atlaspec.set(key, run);
  }
  return [...direct.entries()].flatMap(([key, directRun]) => {
    const atlaspecRun = atlaspec.get(key);
    return atlaspecRun === undefined ? [] : [{ direct: directRun, atlaspec: atlaspecRun }];
  });
}

function comparison(
  definition: RepairComparisonDefinition,
  pairs: readonly Pair[],
): SymmetricRepairComparison {
  const directRuns = pairs.map((pair) => pair.direct);
  const atlaspecRuns = pairs.map((pair) => pair.atlaspec);
  const directOutputTokens = mean(directRuns.map(outputTokens));
  const atlaspecOutputTokens = mean(atlaspecRuns.map(outputTokens));
  const directLatency = mean(directRuns.map(latency));
  const atlaspecLatency = mean(atlaspecRuns.map(latency));
  const directCharge = observedChargePerRun(directRuns);
  const atlaspecCharge = observedChargePerRun(atlaspecRuns);
  const deltas = pairs.map(
    (pair) => Number(pair.atlaspec.final_accepted) - Number(pair.direct.final_accepted),
  );
  return {
    renderer: definition.renderer,
    direct_condition: definition.direct,
    atlaspec_condition: definition.atlaspec,
    paired_runs: pairs.length,
    direct_first_attempt_yield: rate(directRuns, (run) => run.first_attempt_accepted),
    atlaspec_first_attempt_yield: rate(atlaspecRuns, (run) => run.first_attempt_accepted),
    direct_final_yield: rate(directRuns, (run) => run.final_accepted),
    atlaspec_final_yield: rate(atlaspecRuns, (run) => run.final_accepted),
    final_yield_delta: mean(deltas),
    final_yield_delta_ci_95: bootstrapMeanInterval(deltas, 10_000, 0x41544c41),
    direct_repair_rate: rate(directRuns, (run) => run.repair_iterations > 0),
    atlaspec_repair_rate: rate(atlaspecRuns, (run) => run.repair_iterations > 0),
    direct_output_tokens_per_run: directOutputTokens,
    atlaspec_output_tokens_per_run: atlaspecOutputTokens,
    output_token_reduction: reduction(directOutputTokens, atlaspecOutputTokens),
    direct_latency_ms_per_run: directLatency,
    atlaspec_latency_ms_per_run: atlaspecLatency,
    latency_reduction: reduction(directLatency, atlaspecLatency),
    direct_charge_usd_per_run: directCharge,
    atlaspec_charge_usd_per_run: atlaspecCharge,
    charge_reduction:
      directCharge === null || atlaspecCharge === null
        ? null
        : reduction(directCharge, atlaspecCharge),
  };
}

function outputTokens(run: V02RunRecord): number {
  return generationResponses(run)
    .reduce(
      (total, response) => total + response.usage.output_tokens,
      0,
    );
}

function latency(run: V02RunRecord): number {
  return generationResponses(run).reduce(
    (total, response) => total + response.latency_ms,
    0,
  );
}

function observedChargePerRun(runs: readonly V02RunRecord[]): number | null {
  const responses = runs.flatMap(generationResponses);
  if (responses.some((response) => !response.cost_observed)) return null;
  return (
    responses.reduce((total, response) => total + response.charge_usd, 0) /
    runs.length
  );
}

function generationResponses(
  run: V02RunRecord,
): NonNullable<V02RunRecord['attempts'][number]['response']>[] {
  return run.attempts.flatMap((attempt) =>
    attempt.stage === 'edit' || attempt.response === undefined
      ? []
      : [attempt.response],
  );
}

function reduction(direct: number, atlaspec: number): number {
  return direct === 0 ? 0 : 1 - atlaspec / direct;
}

function rate(
  runs: readonly V02RunRecord[],
  predicate: (run: V02RunRecord) => boolean,
): number {
  return runs.filter(predicate).length / runs.length;
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function bootstrapMeanInterval(
  values: readonly number[],
  iterations: number,
  seed: number,
): [number, number] {
  if (values.length === 1) return [values[0]!, values[0]!];
  const random = xorshift32(seed);
  const samples: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let total = 0;
    for (let index = 0; index < values.length; index += 1) {
      total += values[Math.floor(random() * values.length)]!;
    }
    samples.push(total / values.length);
  }
  samples.sort((a, b) => a - b);
  return [
    samples[Math.floor(iterations * 0.025)]!,
    samples[Math.floor(iterations * 0.975)]!,
  ];
}

function xorshift32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}
