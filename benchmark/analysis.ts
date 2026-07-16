import type {
  ConditionSummary,
  ExperimentReport,
} from './experiment.js';
import type { BenchmarkCondition, RunRecord } from './protocol.js';

export interface AnalysisThresholds {
  relative_failure_reduction: number;
  cost_reduction: number;
  low_baseline_failure_rate: number;
  yield_noninferiority_margin: number;
  confidence_level: number;
  bootstrap_iterations: number;
  bootstrap_seed: number;
}

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  confidence_level: number;
}

export type GateStatus = 'pass' | 'fail' | 'insufficient';

export interface AutomatedGateReport {
  status: GateStatus;
  full_benchmark_status: 'not-evaluated';
  target: 'atlaspec';
  baseline: BenchmarkCondition | null;
  paired_runs: number;
  thresholds: AnalysisThresholds;
  baseline_reliable_map_yield: number | null;
  atlaspec_reliable_map_yield: number | null;
  absolute_yield_delta: number | null;
  absolute_yield_delta_ci: ConfidenceInterval | null;
  relative_failure_reduction: number | null;
  relative_failure_reduction_ci: ConfidenceInterval | null;
  cost_reduction: number | null;
  cost_reduction_ci: ConfidenceInterval | null;
  primary_gate: GateStatus;
  cost_gate: GateStatus;
  reasons: string[];
}

export const LOCKED_THRESHOLDS: AnalysisThresholds = {
  relative_failure_reduction: 0.3,
  cost_reduction: 0.25,
  low_baseline_failure_rate: 0.1,
  yield_noninferiority_margin: 0.03,
  confidence_level: 0.95,
  bootstrap_iterations: 10_000,
  bootstrap_seed: 20_260_716,
};

interface Pair {
  baselineAccepted: boolean;
  atlaspecAccepted: boolean;
  baselineCost: number;
  atlaspecCost: number;
  completeCost: boolean;
}

interface EffectEstimate {
  yieldDelta: number;
  relativeFailureReduction: number | null;
  costReduction: number | null;
}

export function analyzeComparison(
  report: ExperimentReport,
  thresholds: AnalysisThresholds = LOCKED_THRESHOLDS,
): AutomatedGateReport {
  assertThresholds(thresholds);
  const baseline = selectBestBaseline(report.summaries);
  const atlaspec = report.summaries.find(
    (summary) => summary.condition === 'atlaspec',
  );
  if (baseline === undefined || atlaspec === undefined) {
    return insufficient(
      thresholds,
      baseline?.condition ?? null,
      'Both Atlaspec and at least one direct baseline are required.',
    );
  }

  const pairs = pairRuns(report.runs, baseline.condition);
  if (pairs.length === 0) {
    return insufficient(
      thresholds,
      baseline.condition,
      'No task and repetition pairs are shared by Atlaspec and the selected baseline.',
    );
  }

  const point = estimate(pairs);
  const samples = bootstrap(pairs, thresholds);
  const yieldCi = interval(
    samples.map((sample) => sample.yieldDelta),
    thresholds.confidence_level,
  );
  const relativeCi = nullableInterval(
    samples.map((sample) => sample.relativeFailureReduction),
    thresholds.confidence_level,
  );
  const costCi = nullableInterval(
    samples.map((sample) => sample.costReduction),
    thresholds.confidence_level,
  );
  const reasons: string[] = [];

  const baselineFailure = 1 - baseline.reliable_map_yield;
  let primaryGate: GateStatus;
  if (baselineFailure < thresholds.low_baseline_failure_rate) {
    primaryGate =
      yieldCi.lower >= -thresholds.yield_noninferiority_margin
        ? 'pass'
        : 'fail';
    reasons.push(
      `Baseline failure rate ${(baselineFailure * 100).toFixed(2)}% is below the locked low-failure threshold; the yield non-inferiority gate applies.`,
    );
  } else if (point.relativeFailureReduction === null || relativeCi === null) {
    primaryGate = 'insufficient';
    reasons.push('Relative failure reduction is undefined for this sample.');
  } else {
    primaryGate =
      point.relativeFailureReduction >= thresholds.relative_failure_reduction &&
      yieldCi.lower > 0
        ? 'pass'
        : 'fail';
  }

  const completeCost = pairs.every((pair) => pair.completeCost);
  let costGate: GateStatus;
  if (!completeCost) {
    costGate = 'insufficient';
    reasons.push(
      'At least one paired run has a transport error or an adapter that does not report monetary cost.',
    );
  } else if (point.costReduction === null || costCi === null) {
    costGate = 'insufficient';
    reasons.push('Cost reduction is undefined because an accepted-map denominator is zero.');
  } else {
    costGate =
      point.costReduction >= thresholds.cost_reduction ? 'pass' : 'fail';
  }

  const status = combine(primaryGate, costGate);
  reasons.push(
    'Human task accuracy, blind expert review, edit survival, repair-count, and model-stratum gates are not evaluated by this automated report.',
  );
  return {
    status,
    full_benchmark_status: 'not-evaluated',
    target: 'atlaspec',
    baseline: baseline.condition,
    paired_runs: pairs.length,
    thresholds,
    baseline_reliable_map_yield: baseline.reliable_map_yield,
    atlaspec_reliable_map_yield: atlaspec.reliable_map_yield,
    absolute_yield_delta: point.yieldDelta,
    absolute_yield_delta_ci: yieldCi,
    relative_failure_reduction: point.relativeFailureReduction,
    relative_failure_reduction_ci: relativeCi,
    cost_reduction: point.costReduction,
    cost_reduction_ci: costCi,
    primary_gate: primaryGate,
    cost_gate: costGate,
    reasons,
  };
}

function selectBestBaseline(
  summaries: readonly ConditionSummary[],
): ConditionSummary | undefined {
  return summaries
    .filter(
      (summary) =>
        summary.condition === 'direct-maplibre' ||
        summary.condition === 'direct-vega-lite',
    )
    .sort((a, b) => {
      const yieldDifference = b.reliable_map_yield - a.reliable_map_yield;
      if (yieldDifference !== 0) return yieldDifference;
      return costValue(a.cost_per_accepted_map) - costValue(b.cost_per_accepted_map);
    })[0];
}

function pairRuns(
  runs: readonly RunRecord[],
  baseline: BenchmarkCondition,
): Pair[] {
  const baselineRuns = new Map<string, RunRecord>();
  const atlaspecRuns = new Map<string, RunRecord>();
  for (const run of runs) {
    const request = run.attempts[0]?.request;
    if (request === undefined) continue;
    const key = `${request.task_id}/${request.repetition}`;
    if (request.condition === baseline) baselineRuns.set(key, run);
    if (request.condition === 'atlaspec') atlaspecRuns.set(key, run);
  }

  const pairs: Pair[] = [];
  for (const [key, baselineRun] of baselineRuns) {
    const atlaspecRun = atlaspecRuns.get(key);
    if (atlaspecRun === undefined) continue;
    pairs.push({
      baselineAccepted: baselineRun.first_attempt_accepted,
      atlaspecAccepted: atlaspecRun.first_attempt_accepted,
      baselineCost: runCost(baselineRun),
      atlaspecCost: runCost(atlaspecRun),
      completeCost:
        !hasTransportError(baselineRun) &&
        !hasTransportError(atlaspecRun) &&
        hasCompleteCost(baselineRun) &&
        hasCompleteCost(atlaspecRun),
    });
  }
  return pairs;
}

function estimate(pairs: readonly Pair[]): EffectEstimate {
  const baselineAccepted = pairs.filter((pair) => pair.baselineAccepted).length;
  const atlaspecAccepted = pairs.filter((pair) => pair.atlaspecAccepted).length;
  const baselineYield = baselineAccepted / pairs.length;
  const atlaspecYield = atlaspecAccepted / pairs.length;
  const baselineFailure = 1 - baselineYield;
  const baselineCost = sum(pairs.map((pair) => pair.baselineCost));
  const atlaspecCost = sum(pairs.map((pair) => pair.atlaspecCost));
  const baselineCostPerAccepted =
    baselineAccepted === 0 ? null : baselineCost / baselineAccepted;
  const atlaspecCostPerAccepted =
    atlaspecAccepted === 0 ? null : atlaspecCost / atlaspecAccepted;

  return {
    yieldDelta: atlaspecYield - baselineYield,
    relativeFailureReduction:
      baselineFailure === 0
        ? null
        : (baselineFailure - (1 - atlaspecYield)) / baselineFailure,
    costReduction:
      baselineCostPerAccepted === null ||
      atlaspecCostPerAccepted === null ||
      baselineCostPerAccepted === 0
        ? null
        : (baselineCostPerAccepted - atlaspecCostPerAccepted) /
          baselineCostPerAccepted,
  };
}

function bootstrap(
  pairs: readonly Pair[],
  thresholds: AnalysisThresholds,
): EffectEstimate[] {
  const random = mulberry32(thresholds.bootstrap_seed);
  const samples: EffectEstimate[] = [];
  for (let iteration = 0; iteration < thresholds.bootstrap_iterations; iteration += 1) {
    const selected: Pair[] = [];
    for (let index = 0; index < pairs.length; index += 1) {
      selected.push(pairs[Math.floor(random() * pairs.length)]!);
    }
    samples.push(estimate(selected));
  }
  return samples;
}

function interval(
  values: readonly number[],
  confidenceLevel: number,
): ConfidenceInterval {
  const sorted = [...values].sort((a, b) => a - b);
  const alpha = (1 - confidenceLevel) / 2;
  return {
    lower: percentile(sorted, alpha),
    upper: percentile(sorted, 1 - alpha),
    confidence_level: confidenceLevel,
  };
}

function nullableInterval(
  values: readonly (number | null)[],
  confidenceLevel: number,
): ConfidenceInterval | null {
  const defined = values.filter((value): value is number => value !== null);
  return defined.length === 0 ? null : interval(defined, confidenceLevel);
}

function percentile(sorted: readonly number[], quantile: number): number {
  if (sorted.length === 0) throw new Error('Cannot calculate an empty interval.');
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.floor(quantile * sorted.length)),
  );
  return sorted[index]!;
}

function runCost(run: RunRecord): number {
  return sum(
    run.attempts.map((attempt) => attempt.response?.charge_usd ?? 0),
  );
}

function hasTransportError(run: RunRecord): boolean {
  return run.attempts.some((attempt) => attempt.transport_error !== undefined);
}

function hasCompleteCost(run: RunRecord): boolean {
  return run.attempts.every(
    (attempt) =>
      attempt.response !== undefined && attempt.response.cost_observed,
  );
}

function insufficient(
  thresholds: AnalysisThresholds,
  baseline: BenchmarkCondition | null,
  reason: string,
): AutomatedGateReport {
  return {
    status: 'insufficient',
    full_benchmark_status: 'not-evaluated',
    target: 'atlaspec',
    baseline,
    paired_runs: 0,
    thresholds,
    baseline_reliable_map_yield: null,
    atlaspec_reliable_map_yield: null,
    absolute_yield_delta: null,
    absolute_yield_delta_ci: null,
    relative_failure_reduction: null,
    relative_failure_reduction_ci: null,
    cost_reduction: null,
    cost_reduction_ci: null,
    primary_gate: 'insufficient',
    cost_gate: 'insufficient',
    reasons: [reason],
  };
}

function combine(primary: GateStatus, cost: GateStatus): GateStatus {
  if (primary === 'fail' || cost === 'fail') return 'fail';
  if (primary === 'insufficient' || cost === 'insufficient') return 'insufficient';
  return 'pass';
}

function assertThresholds(thresholds: AnalysisThresholds): void {
  for (const [name, value] of Object.entries(thresholds)) {
    if (!Number.isFinite(value)) throw new Error(`Threshold ${name} must be finite.`);
  }
  if (thresholds.bootstrap_iterations < 1) {
    throw new Error('bootstrap_iterations must be positive.');
  }
  if (thresholds.confidence_level <= 0 || thresholds.confidence_level >= 1) {
    throw new Error('confidence_level must be between zero and one.');
  }
}

function costValue(value: number | null): number {
  return value ?? Number.POSITIVE_INFINITY;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
