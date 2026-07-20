import type { ConditionSummary, ExperimentReport } from '../experiment.js';
import type { BenchmarkCondition, RunRecord } from '../protocol.js';
import type { LocalQualificationLedger } from './bundle.js';

export type LocalGateStatus = 'pass' | 'fail' | 'insufficient';

interface ConfidenceInterval {
  lower: number;
  upper: number;
  confidence_level: number;
}

export interface LocalAgentAnalysis {
  status: LocalGateStatus;
  claim_scope: 'within-agent-local-coding-agent';
  baseline: BenchmarkCondition | null;
  paired_runs: number;
  baseline_reliable_map_yield: number | null;
  atlaspec_reliable_map_yield: number | null;
  absolute_yield_delta: number | null;
  absolute_yield_delta_ci: ConfidenceInterval | null;
  relative_failure_reduction: number | null;
  relative_failure_reduction_ci: ConfidenceInterval | null;
  output_tokens_per_accepted_map: {
    baseline: number | null;
    atlaspec: number | null;
    reduction: number | null;
    reduction_ci: ConfidenceInterval | null;
  };
  total_tokens_per_accepted_map: {
    baseline: number | null;
    atlaspec: number | null;
    reduction: number | null;
  };
  uncached_tokens_per_accepted_map: {
    baseline: number | null;
    atlaspec: number | null;
    reduction: number | null;
  };
  latency_ms_per_accepted_map: {
    baseline: number | null;
    atlaspec: number | null;
    reduction: number | null;
  };
  primary_yield_gate: LocalGateStatus;
  output_token_gate: LocalGateStatus;
  reasons: string[];
}

interface Pair {
  baselineAccepted: boolean;
  atlaspecAccepted: boolean;
  baselineOutputTokens: number;
  atlaspecOutputTokens: number;
  baselineTotalTokens: number;
  atlaspecTotalTokens: number;
  baselineUncachedTokens: number;
  atlaspecUncachedTokens: number;
  baselineLatency: number;
  atlaspecLatency: number;
  complete: boolean;
}

interface Estimate {
  baselineYield: number;
  atlaspecYield: number;
  yieldDelta: number;
  relativeFailureReduction: number | null;
  baselineOutputPerAccepted: number | null;
  atlaspecOutputPerAccepted: number | null;
  outputReduction: number | null;
  baselineTotalPerAccepted: number | null;
  atlaspecTotalPerAccepted: number | null;
  totalReduction: number | null;
  baselineUncachedPerAccepted: number | null;
  atlaspecUncachedPerAccepted: number | null;
  uncachedReduction: number | null;
  baselineLatencyPerAccepted: number | null;
  atlaspecLatencyPerAccepted: number | null;
  latencyReduction: number | null;
}

export function analyzeLocalAgent(
  report: ExperimentReport,
  thresholds: LocalQualificationLedger['thresholds'],
): LocalAgentAnalysis {
  const baseline = selectBestBaseline(report.summaries);
  const atlaspec = report.summaries.find((summary) => summary.condition === 'atlaspec');
  if (baseline === undefined || atlaspec === undefined) {
    return insufficient('Both Atlaspec and a direct baseline are required.');
  }
  const pairs = pairRuns(report.runs, baseline.condition);
  if (pairs.length === 0 || pairs.some((pair) => !pair.complete)) {
    return insufficient('Every paired first attempt must report token and latency usage.', baseline.condition);
  }

  const point = estimate(pairs);
  const samples = bootstrap(pairs, thresholds.bootstrap_iterations, thresholds.bootstrap_seed);
  const yieldCi = interval(samples.map((sample) => sample.yieldDelta), thresholds.confidence_level);
  const relativeCi = nullableInterval(
    samples.map((sample) => sample.relativeFailureReduction),
    thresholds.confidence_level,
  );
  const outputCi = nullableInterval(
    samples.map((sample) => sample.outputReduction),
    thresholds.confidence_level,
  );
  const reasons: string[] = [];

  const baselineFailure = 1 - point.baselineYield;
  let primaryYieldGate: LocalGateStatus;
  if (baselineFailure < thresholds.low_baseline_failure_rate) {
    primaryYieldGate =
      yieldCi.lower >= -thresholds.yield_noninferiority_margin ? 'pass' : 'fail';
    reasons.push('The baseline is in the locked low-failure slice; yield non-inferiority applies.');
  } else if (point.relativeFailureReduction === null || relativeCi === null) {
    primaryYieldGate = 'insufficient';
  } else {
    primaryYieldGate =
      point.relativeFailureReduction >= thresholds.relative_failure_reduction &&
      yieldCi.lower > 0
        ? 'pass'
        : 'fail';
  }

  let outputTokenGate: LocalGateStatus;
  if (point.outputReduction === null || outputCi === null) {
    outputTokenGate = 'insufficient';
    reasons.push('Output tokens per accepted map are undefined because an accepted denominator is zero.');
  } else {
    outputTokenGate =
      point.outputReduction >= thresholds.output_token_reduction && outputCi.lower > 0
        ? 'pass'
        : 'fail';
  }
  reasons.push(
    'Token values are comparable only across conditions within this agent; absolute Codex-versus-Claude token comparisons are prohibited.',
  );

  return {
    status: combine(primaryYieldGate, outputTokenGate),
    claim_scope: 'within-agent-local-coding-agent',
    baseline: baseline.condition,
    paired_runs: pairs.length,
    baseline_reliable_map_yield: point.baselineYield,
    atlaspec_reliable_map_yield: point.atlaspecYield,
    absolute_yield_delta: point.yieldDelta,
    absolute_yield_delta_ci: yieldCi,
    relative_failure_reduction: point.relativeFailureReduction,
    relative_failure_reduction_ci: relativeCi,
    output_tokens_per_accepted_map: {
      baseline: point.baselineOutputPerAccepted,
      atlaspec: point.atlaspecOutputPerAccepted,
      reduction: point.outputReduction,
      reduction_ci: outputCi,
    },
    total_tokens_per_accepted_map: {
      baseline: point.baselineTotalPerAccepted,
      atlaspec: point.atlaspecTotalPerAccepted,
      reduction: point.totalReduction,
    },
    uncached_tokens_per_accepted_map: {
      baseline: point.baselineUncachedPerAccepted,
      atlaspec: point.atlaspecUncachedPerAccepted,
      reduction: point.uncachedReduction,
    },
    latency_ms_per_accepted_map: {
      baseline: point.baselineLatencyPerAccepted,
      atlaspec: point.atlaspecLatencyPerAccepted,
      reduction: point.latencyReduction,
    },
    primary_yield_gate: primaryYieldGate,
    output_token_gate: outputTokenGate,
    reasons,
  };
}

function selectBestBaseline(summaries: readonly ConditionSummary[]): ConditionSummary | undefined {
  return summaries
    .filter((summary) =>
      summary.condition === 'direct-maplibre' || summary.condition === 'direct-vega-lite',
    )
    .sort((a, b) => {
      const yieldDifference = b.reliable_map_yield - a.reliable_map_yield;
      if (yieldDifference !== 0) return yieldDifference;
      return tokensPerAccepted(a) - tokensPerAccepted(b);
    })[0];
}

function tokensPerAccepted(summary: ConditionSummary): number {
  return summary.first_attempt_accepted === 0
    ? Number.POSITIVE_INFINITY
    : summary.output_tokens / summary.first_attempt_accepted;
}

function pairRuns(runs: readonly RunRecord[], baseline: BenchmarkCondition): Pair[] {
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
    pairs.push(pair(baselineRun, atlaspecRun));
  }
  return pairs;
}

function pair(baseline: RunRecord, atlaspec: RunRecord): Pair {
  const baselineResponse = baseline.attempts[0]?.response;
  const atlaspecResponse = atlaspec.attempts[0]?.response;
  return {
    baselineAccepted: baseline.first_attempt_accepted,
    atlaspecAccepted: atlaspec.first_attempt_accepted,
    baselineOutputTokens: baselineResponse?.usage.output_tokens ?? 0,
    atlaspecOutputTokens: atlaspecResponse?.usage.output_tokens ?? 0,
    baselineTotalTokens: totalTokens(baselineResponse),
    atlaspecTotalTokens: totalTokens(atlaspecResponse),
    baselineUncachedTokens: uncachedTokens(baselineResponse),
    atlaspecUncachedTokens: uncachedTokens(atlaspecResponse),
    baselineLatency: baselineResponse?.latency_ms ?? 0,
    atlaspecLatency: atlaspecResponse?.latency_ms ?? 0,
    complete: baselineResponse !== undefined && atlaspecResponse !== undefined,
  };
}

function totalTokens(response: RunRecord['attempts'][number]['response']): number {
  return response === undefined ? 0 : response.usage.input_tokens + response.usage.output_tokens;
}

function uncachedTokens(response: RunRecord['attempts'][number]['response']): number {
  if (response === undefined) return 0;
  return Math.max(0, response.usage.input_tokens - (response.usage.cached_input_tokens ?? 0)) +
    response.usage.output_tokens;
}

function estimate(pairs: readonly Pair[]): Estimate {
  const baselineAccepted = pairs.filter((pair) => pair.baselineAccepted).length;
  const atlaspecAccepted = pairs.filter((pair) => pair.atlaspecAccepted).length;
  const baselineYield = baselineAccepted / pairs.length;
  const atlaspecYield = atlaspecAccepted / pairs.length;
  const baselineFailure = 1 - baselineYield;
  const baselineOutput = perAccepted(pairs, baselineAccepted, 'baselineOutputTokens');
  const atlaspecOutput = perAccepted(pairs, atlaspecAccepted, 'atlaspecOutputTokens');
  const baselineTotal = perAccepted(pairs, baselineAccepted, 'baselineTotalTokens');
  const atlaspecTotal = perAccepted(pairs, atlaspecAccepted, 'atlaspecTotalTokens');
  const baselineUncached = perAccepted(pairs, baselineAccepted, 'baselineUncachedTokens');
  const atlaspecUncached = perAccepted(pairs, atlaspecAccepted, 'atlaspecUncachedTokens');
  const baselineLatency = perAccepted(pairs, baselineAccepted, 'baselineLatency');
  const atlaspecLatency = perAccepted(pairs, atlaspecAccepted, 'atlaspecLatency');
  return {
    baselineYield,
    atlaspecYield,
    yieldDelta: atlaspecYield - baselineYield,
    relativeFailureReduction:
      baselineFailure === 0
        ? null
        : (baselineFailure - (1 - atlaspecYield)) / baselineFailure,
    baselineOutputPerAccepted: baselineOutput,
    atlaspecOutputPerAccepted: atlaspecOutput,
    outputReduction: reduction(baselineOutput, atlaspecOutput),
    baselineTotalPerAccepted: baselineTotal,
    atlaspecTotalPerAccepted: atlaspecTotal,
    totalReduction: reduction(baselineTotal, atlaspecTotal),
    baselineUncachedPerAccepted: baselineUncached,
    atlaspecUncachedPerAccepted: atlaspecUncached,
    uncachedReduction: reduction(baselineUncached, atlaspecUncached),
    baselineLatencyPerAccepted: baselineLatency,
    atlaspecLatencyPerAccepted: atlaspecLatency,
    latencyReduction: reduction(baselineLatency, atlaspecLatency),
  };
}

type NumericPairKey = {
  [K in keyof Pair]: Pair[K] extends number ? K : never;
}[keyof Pair];

function perAccepted(
  pairs: readonly Pair[],
  accepted: number,
  key: NumericPairKey,
): number | null {
  return accepted === 0 ? null : sum(pairs.map((pair) => pair[key] as number)) / accepted;
}

function reduction(baseline: number | null, atlaspec: number | null): number | null {
  return baseline === null || atlaspec === null || baseline === 0
    ? null
    : (baseline - atlaspec) / baseline;
}

function bootstrap(
  pairs: readonly Pair[],
  iterations: number,
  seed: number,
): Estimate[] {
  const random = mulberry32(seed);
  const result: Estimate[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const selected: Pair[] = [];
    for (let index = 0; index < pairs.length; index += 1) {
      selected.push(pairs[Math.floor(random() * pairs.length)]!);
    }
    result.push(estimate(selected));
  }
  return result;
}

function interval(values: readonly number[], confidenceLevel: number): ConfidenceInterval {
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
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor(quantile * sorted.length)));
  return sorted[index]!;
}

function combine(first: LocalGateStatus, second: LocalGateStatus): LocalGateStatus {
  if (first === 'fail' || second === 'fail') return 'fail';
  if (first === 'insufficient' || second === 'insufficient') return 'insufficient';
  return 'pass';
}

function insufficient(reason: string, baseline: BenchmarkCondition | null = null): LocalAgentAnalysis {
  return {
    status: 'insufficient',
    claim_scope: 'within-agent-local-coding-agent',
    baseline,
    paired_runs: 0,
    baseline_reliable_map_yield: null,
    atlaspec_reliable_map_yield: null,
    absolute_yield_delta: null,
    absolute_yield_delta_ci: null,
    relative_failure_reduction: null,
    relative_failure_reduction_ci: null,
    output_tokens_per_accepted_map: { baseline: null, atlaspec: null, reduction: null, reduction_ci: null },
    total_tokens_per_accepted_map: { baseline: null, atlaspec: null, reduction: null },
    uncached_tokens_per_accepted_map: { baseline: null, atlaspec: null, reduction: null },
    latency_ms_per_accepted_map: { baseline: null, atlaspec: null, reduction: null },
    primary_yield_gate: 'insufficient',
    output_token_gate: 'insufficient',
    reasons: [reason],
  };
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
