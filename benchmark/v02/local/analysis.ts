import type { GenerationResponse } from '../../protocol.js';
import type { V02RunRecord } from '../experiment.js';
import type { V02EvaluationManifest } from '../manifest.js';
import type { V02LocalThresholds } from './bundle.js';

export type V02GateStatus = 'pass' | 'fail' | 'insufficient';

export interface V02ConfidenceInterval {
  lower: number;
  upper: number;
  confidence_level: number;
}

export interface V02AgentAnalysis {
  status: V02GateStatus;
  claim_scope: 'within-agent-local-coding-agent';
  paired_runs: number;
  task_clusters: number;
  reliability: {
    direct_yield: number | null;
    atlaspec_yield: number | null;
    absolute_delta: number | null;
    absolute_delta_ci: V02ConfidenceInterval | null;
    relative_failure_reduction: number | null;
    relative_failure_reduction_ci: V02ConfidenceInterval | null;
    gate: V02GateStatus;
  };
  generation_uncached_input_tokens_per_accepted_map: ComparativeTokenMetric;
  generation_uncached_tokens_per_accepted_map: TokenMetric;
  generation_output_tokens_per_accepted_map: TokenMetric;
  uncached_token_gate_feasibility: TokenGateFeasibility;
  edit_survival: {
    direct: RateMetric;
    atlaspec: RateMetric;
    atlaspec_gate: V02GateStatus;
  };
  portability: RateMetric & { gate: V02GateStatus };
  capability_fail_closed: RateMetric & { gate: V02GateStatus };
  repair: {
    attempted_runs: number;
    first_accepted: number;
    final_accepted: number;
    recovered: number;
    iterations: number;
  };
  reasons: string[];
}

interface TokenMetric {
  direct: number | null;
  atlaspec: number | null;
  reduction: number | null;
  reduction_ci: V02ConfidenceInterval | null;
  complete: boolean;
  gate: V02GateStatus;
}

interface ComparativeTokenMetric {
  direct: number | null;
  atlaspec: number | null;
  reduction: number | null;
  complete: boolean;
}

interface TokenGateFeasibility {
  threshold: number;
  required_atlaspec_total: number | null;
  required_atlaspec_uncached_input: number | null;
  observed_atlaspec_uncached_input: number | null;
  additional_uncached_input_reduction_required: number | null;
  output_only_ceiling_at_equal_input: number | null;
  gate_reachable_at_equal_input: boolean | null;
}

interface RateMetric {
  eligible: number;
  passed: number;
  rate: number | null;
}

interface Pair {
  taskId: string;
  directAccepted: boolean;
  atlaspecAccepted: boolean;
  directResponse?: GenerationResponse;
  atlaspecResponse?: GenerationResponse;
}

interface Estimate {
  directYield: number;
  atlaspecYield: number;
  yieldDelta: number;
  relativeFailureReduction: number | null;
  directUncachedInputPerAccepted: number | null;
  atlaspecUncachedInputPerAccepted: number | null;
  uncachedInputReduction: number | null;
  directUncachedPerAccepted: number | null;
  atlaspecUncachedPerAccepted: number | null;
  uncachedReduction: number | null;
  directOutputPerAccepted: number | null;
  atlaspecOutputPerAccepted: number | null;
  outputReduction: number | null;
}

export function analyzeV02LocalAgent(
  runs: readonly V02RunRecord[],
  manifest: V02EvaluationManifest,
  thresholds: V02LocalThresholds,
): V02AgentAnalysis {
  const pairs = pairGenerationRuns(runs);
  const taskIds = [...new Set(pairs.map((pair) => pair.taskId))];
  const reasons = [
    'Token comparisons are within one agent only; cross-agent absolute token comparisons are prohibited.',
    'Generation gates exclude edit and repair turns; transport failures remain in the reliability denominator.',
    'Repair recovery is descriptive: direct MapLibre has no symmetric repair condition, so the locked repair-reduction gate is not automated here.',
  ];
  if (pairs.length === 0 || taskIds.length < 2) {
    return insufficientAnalysis(
      pairs.length,
      taskIds.length,
      'At least two task clusters with paired direct and Atlaspec runs are required.',
      reasons,
      thresholds.uncached_token_reduction,
    );
  }

  const point = estimate(pairs);
  const samples = clusterBootstrap(
    pairs,
    thresholds.bootstrap_iterations,
    thresholds.bootstrap_seed,
  );
  const yieldCi = interval(
    samples.map((sample) => sample.yieldDelta),
    thresholds.confidence_level,
  );
  const relativeCi = nullableInterval(
    samples.map((sample) => sample.relativeFailureReduction),
    thresholds.confidence_level,
  );
  const tokensComplete = pairs.every(
    (pair) => pair.directResponse !== undefined && pair.atlaspecResponse !== undefined,
  );
  if (!tokensComplete) {
    reasons.push('At least one paired generation had no response usage; token gates are insufficient.');
  }
  const uncachedCi = tokensComplete
    ? nullableInterval(
        samples.map((sample) => sample.uncachedReduction),
        thresholds.confidence_level,
      )
    : null;
  const outputCi = tokensComplete
    ? nullableInterval(
        samples.map((sample) => sample.outputReduction),
        thresholds.confidence_level,
      )
    : null;

  const baselineFailure = 1 - point.directYield;
  let reliabilityGate: V02GateStatus;
  if (baselineFailure < thresholds.low_baseline_failure_rate) {
    reliabilityGate =
      yieldCi.lower >= -thresholds.yield_noninferiority_margin ? 'pass' : 'fail';
    reasons.push('Direct MapLibre is in the locked low-failure slice; yield non-inferiority applies.');
  } else if (point.relativeFailureReduction === null || relativeCi === null) {
    reliabilityGate = 'insufficient';
  } else {
    reliabilityGate =
      point.relativeFailureReduction >= thresholds.relative_failure_reduction &&
      yieldCi.lower > 0
        ? 'pass'
        : 'fail';
  }

  const uncachedMetric = tokenMetric(
    point.directUncachedPerAccepted,
    point.atlaspecUncachedPerAccepted,
    point.uncachedReduction,
    uncachedCi,
    tokensComplete,
    thresholds.uncached_token_reduction,
  );
  const outputMetric = tokenMetric(
    point.directOutputPerAccepted,
    point.atlaspecOutputPerAccepted,
    point.outputReduction,
    outputCi,
    tokensComplete,
    thresholds.output_token_reduction,
  );
  const uncachedInputMetric: ComparativeTokenMetric = {
    direct: point.directUncachedInputPerAccepted,
    atlaspec: point.atlaspecUncachedInputPerAccepted,
    reduction: point.uncachedInputReduction,
    complete: tokensComplete,
  };
  const tokenGateFeasibility = computeTokenGateFeasibility(
    point,
    thresholds.uncached_token_reduction,
  );
  const edit = editMetrics(runs);
  const atlaspecEditGate = rateGate(edit.atlaspec, thresholds.edit_survival);
  const portability = portabilityMetric(runs, manifest);
  const portabilityGate = rateGate(portability, thresholds.portability);
  const capability = capabilityMetric(runs, manifest);
  const capabilityGate = rateGate(capability, thresholds.capability_fail_closed);
  const repairRuns = runs.filter((run) => run.condition === 'atlaspec-repair');
  const repair = {
    attempted_runs: repairRuns.length,
    first_accepted: repairRuns.filter((run) => run.first_attempt_accepted).length,
    final_accepted: repairRuns.filter((run) => run.final_accepted).length,
    recovered: repairRuns.filter(
      (run) => !run.first_attempt_accepted && run.final_accepted,
    ).length,
    iterations: sum(repairRuns.map((run) => run.repair_iterations)),
  };
  const gates = [
    reliabilityGate,
    uncachedMetric.gate,
    outputMetric.gate,
    atlaspecEditGate,
    portabilityGate,
    capabilityGate,
  ];

  return {
    status: combine(gates),
    claim_scope: 'within-agent-local-coding-agent',
    paired_runs: pairs.length,
    task_clusters: taskIds.length,
    reliability: {
      direct_yield: point.directYield,
      atlaspec_yield: point.atlaspecYield,
      absolute_delta: point.yieldDelta,
      absolute_delta_ci: yieldCi,
      relative_failure_reduction: point.relativeFailureReduction,
      relative_failure_reduction_ci: relativeCi,
      gate: reliabilityGate,
    },
    generation_uncached_input_tokens_per_accepted_map: uncachedInputMetric,
    generation_uncached_tokens_per_accepted_map: uncachedMetric,
    generation_output_tokens_per_accepted_map: outputMetric,
    uncached_token_gate_feasibility: tokenGateFeasibility,
    edit_survival: {
      direct: edit.direct,
      atlaspec: edit.atlaspec,
      atlaspec_gate: atlaspecEditGate,
    },
    portability: { ...portability, gate: portabilityGate },
    capability_fail_closed: { ...capability, gate: capabilityGate },
    repair,
    reasons,
  };
}

function pairGenerationRuns(runs: readonly V02RunRecord[]): Pair[] {
  const direct = new Map<string, V02RunRecord>();
  const atlaspec = new Map<string, V02RunRecord>();
  for (const run of runs) {
    const key = `${run.task_id}/${run.repetition}`;
    if (run.condition === 'direct-maplibre') direct.set(key, run);
    if (run.condition === 'atlaspec-maplibre') atlaspec.set(key, run);
  }
  const pairs: Pair[] = [];
  for (const [key, directRun] of direct) {
    const atlaspecRun = atlaspec.get(key);
    if (atlaspecRun === undefined) continue;
    const directResponse = initialResponse(directRun);
    const atlaspecResponse = initialResponse(atlaspecRun);
    pairs.push({
      taskId: directRun.task_id,
      directAccepted: directRun.first_attempt_accepted,
      atlaspecAccepted: atlaspecRun.first_attempt_accepted,
      ...(directResponse === undefined ? {} : { directResponse }),
      ...(atlaspecResponse === undefined ? {} : { atlaspecResponse }),
    });
  }
  return pairs;
}

function initialResponse(run: V02RunRecord): GenerationResponse | undefined {
  return run.attempts.find((attempt) => attempt.stage === 'initial')?.response;
}

function estimate(pairs: readonly Pair[]): Estimate {
  const directAccepted = pairs.filter((pair) => pair.directAccepted).length;
  const atlaspecAccepted = pairs.filter((pair) => pair.atlaspecAccepted).length;
  const directYield = directAccepted / pairs.length;
  const atlaspecYield = atlaspecAccepted / pairs.length;
  const directFailure = 1 - directYield;
  const directUncached = perAccepted(pairs, directAccepted, 'direct', uncachedTokens);
  const atlaspecUncached = perAccepted(pairs, atlaspecAccepted, 'atlaspec', uncachedTokens);
  const directUncachedInput = perAccepted(
    pairs,
    directAccepted,
    'direct',
    uncachedInputTokens,
  );
  const atlaspecUncachedInput = perAccepted(
    pairs,
    atlaspecAccepted,
    'atlaspec',
    uncachedInputTokens,
  );
  const directOutput = perAccepted(pairs, directAccepted, 'direct', outputTokens);
  const atlaspecOutput = perAccepted(pairs, atlaspecAccepted, 'atlaspec', outputTokens);
  return {
    directYield,
    atlaspecYield,
    yieldDelta: atlaspecYield - directYield,
    relativeFailureReduction:
      directFailure === 0
        ? null
        : (directFailure - (1 - atlaspecYield)) / directFailure,
    directUncachedInputPerAccepted: directUncachedInput,
    atlaspecUncachedInputPerAccepted: atlaspecUncachedInput,
    uncachedInputReduction: reduction(directUncachedInput, atlaspecUncachedInput),
    directUncachedPerAccepted: directUncached,
    atlaspecUncachedPerAccepted: atlaspecUncached,
    uncachedReduction: reduction(directUncached, atlaspecUncached),
    directOutputPerAccepted: directOutput,
    atlaspecOutputPerAccepted: atlaspecOutput,
    outputReduction: reduction(directOutput, atlaspecOutput),
  };
}

function perAccepted(
  pairs: readonly Pair[],
  accepted: number,
  side: 'direct' | 'atlaspec',
  metric: (response: GenerationResponse) => number,
): number | null {
  if (accepted === 0) return null;
  const key = side === 'direct' ? 'directResponse' : 'atlaspecResponse';
  return (
    sum(
      pairs.map((pair) => {
        const response = pair[key];
        return response === undefined ? 0 : metric(response);
      }),
    ) / accepted
  );
}

function uncachedTokens(response: GenerationResponse): number {
  return uncachedInputTokens(response) + response.usage.output_tokens;
}

function uncachedInputTokens(response: GenerationResponse): number {
  return Math.max(
    0,
    response.usage.input_tokens - (response.usage.cached_input_tokens ?? 0),
  );
}

function outputTokens(response: GenerationResponse): number {
  return response.usage.output_tokens;
}

function tokenMetric(
  direct: number | null,
  atlaspec: number | null,
  reductionValue: number | null,
  reductionCi: V02ConfidenceInterval | null,
  complete: boolean,
  threshold: number,
): TokenMetric {
  const gate =
    !complete || reductionValue === null || reductionCi === null
      ? 'insufficient'
      : reductionValue >= threshold && reductionCi.lower > 0
        ? 'pass'
        : 'fail';
  return {
    direct,
    atlaspec,
    reduction: reductionValue,
    reduction_ci: reductionCi,
    complete,
    gate,
  };
}

function computeTokenGateFeasibility(
  point: Estimate,
  threshold: number,
): TokenGateFeasibility {
  const directTotal = point.directUncachedPerAccepted;
  const directInput = point.directUncachedInputPerAccepted;
  const directOutput = point.directOutputPerAccepted;
  const atlaspecInput = point.atlaspecUncachedInputPerAccepted;
  const atlaspecOutput = point.atlaspecOutputPerAccepted;
  if (
    directTotal === null ||
    directTotal === 0 ||
    directInput === null ||
    directOutput === null ||
    atlaspecInput === null ||
    atlaspecOutput === null
  ) {
    return {
      threshold,
      required_atlaspec_total: null,
      required_atlaspec_uncached_input: null,
      observed_atlaspec_uncached_input: atlaspecInput,
      additional_uncached_input_reduction_required: null,
      output_only_ceiling_at_equal_input: null,
      gate_reachable_at_equal_input: null,
    };
  }
  const requiredTotal = directTotal * (1 - threshold);
  const requiredInput = requiredTotal - atlaspecOutput;
  const outputOnlyCeiling = directOutput / directTotal;
  return {
    threshold,
    required_atlaspec_total: requiredTotal,
    required_atlaspec_uncached_input: requiredInput,
    observed_atlaspec_uncached_input: atlaspecInput,
    additional_uncached_input_reduction_required: Math.max(
      0,
      atlaspecInput - requiredInput,
    ),
    output_only_ceiling_at_equal_input: outputOnlyCeiling,
    gate_reachable_at_equal_input: outputOnlyCeiling >= threshold,
  };
}

function editMetrics(runs: readonly V02RunRecord[]): {
  direct: RateMetric;
  atlaspec: RateMetric;
} {
  return {
    direct: editRate(runs.filter((run) => run.condition === 'direct-maplibre')),
    atlaspec: editRate(runs.filter((run) => run.condition === 'atlaspec-maplibre')),
  };
}

function editRate(runs: readonly V02RunRecord[]): RateMetric {
  const eligible = runs.filter((run) => run.final_accepted);
  return {
    eligible: eligible.length,
    passed: eligible.filter((run) => run.edit?.accepted === true).length,
    rate:
      eligible.length === 0
        ? null
        : eligible.filter((run) => run.edit?.accepted === true).length /
          eligible.length,
  };
}

function portabilityMetric(
  runs: readonly V02RunRecord[],
  manifest: V02EvaluationManifest,
): RateMetric {
  const representable = new Set(
    manifest.tasks
      .filter((task) => task.portability === 'representable')
      .map((task) => task.id),
  );
  const mapRuns = new Map(
    runs
      .filter(
        (run) =>
          run.condition === 'atlaspec-maplibre' && representable.has(run.task_id),
      )
      .map((run) => [`${run.task_id}/${run.repetition}`, run]),
  );
  const vegaRuns = runs.filter(
    (run) =>
      run.condition === 'atlaspec-vega-lite' && representable.has(run.task_id),
  );
  const passed = vegaRuns.filter((run) => {
    const mapRun = mapRuns.get(`${run.task_id}/${run.repetition}`);
    return mapRun?.final_accepted === true && run.final_accepted;
  }).length;
  return {
    eligible: vegaRuns.length,
    passed,
    rate: vegaRuns.length === 0 ? null : passed / vegaRuns.length,
  };
}

function capabilityMetric(
  runs: readonly V02RunRecord[],
  manifest: V02EvaluationManifest,
): RateMetric {
  const negative = new Set(
    manifest.tasks
      .filter((task) => task.portability === 'capability-negative')
      .map((task) => task.id),
  );
  const eligible = runs.filter(
    (run) =>
      run.condition === 'vega-capability-negative' && negative.has(run.task_id),
  );
  const passed = eligible.filter((run) => run.final_accepted).length;
  return {
    eligible: eligible.length,
    passed,
    rate: eligible.length === 0 ? null : passed / eligible.length,
  };
}

function rateGate(metric: RateMetric, threshold: number): V02GateStatus {
  return metric.rate === null
    ? 'insufficient'
    : metric.rate >= threshold
      ? 'pass'
      : 'fail';
}

function clusterBootstrap(
  pairs: readonly Pair[],
  iterations: number,
  seed: number,
): Estimate[] {
  const clusters = [...new Set(pairs.map((pair) => pair.taskId))].map((taskId) =>
    pairs.filter((pair) => pair.taskId === taskId),
  );
  const random = mulberry32(seed);
  const result: Estimate[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const selected: Pair[] = [];
    for (let index = 0; index < clusters.length; index += 1) {
      selected.push(...clusters[Math.floor(random() * clusters.length)]!);
    }
    result.push(estimate(selected));
  }
  return result;
}

function interval(
  values: readonly number[],
  confidenceLevel: number,
): V02ConfidenceInterval {
  const sorted = [...values].sort((left, right) => left - right);
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
): V02ConfidenceInterval | null {
  const defined = values.filter((value): value is number => value !== null);
  return defined.length === 0 ? null : interval(defined, confidenceLevel);
}

function percentile(sorted: readonly number[], quantile: number): number {
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.floor(quantile * sorted.length)),
  );
  return sorted[index]!;
}

function reduction(direct: number | null, atlaspec: number | null): number | null {
  return direct === null || atlaspec === null || direct === 0
    ? null
    : (direct - atlaspec) / direct;
}

function combine(gates: readonly V02GateStatus[]): V02GateStatus {
  if (gates.includes('fail')) return 'fail';
  if (gates.includes('insufficient')) return 'insufficient';
  return 'pass';
}

function insufficientAnalysis(
  pairedRuns: number,
  taskClusters: number,
  reason: string,
  reasons: string[],
  uncachedTokenThreshold: number,
): V02AgentAnalysis {
  const emptyRate = { eligible: 0, passed: 0, rate: null };
  const emptyToken: TokenMetric = {
    direct: null,
    atlaspec: null,
    reduction: null,
    reduction_ci: null,
    complete: false,
    gate: 'insufficient',
  };
  return {
    status: 'insufficient',
    claim_scope: 'within-agent-local-coding-agent',
    paired_runs: pairedRuns,
    task_clusters: taskClusters,
    reliability: {
      direct_yield: null,
      atlaspec_yield: null,
      absolute_delta: null,
      absolute_delta_ci: null,
      relative_failure_reduction: null,
      relative_failure_reduction_ci: null,
      gate: 'insufficient',
    },
    generation_uncached_input_tokens_per_accepted_map: {
      direct: null,
      atlaspec: null,
      reduction: null,
      complete: false,
    },
    generation_uncached_tokens_per_accepted_map: emptyToken,
    generation_output_tokens_per_accepted_map: { ...emptyToken },
    uncached_token_gate_feasibility: {
      threshold: uncachedTokenThreshold,
      required_atlaspec_total: null,
      required_atlaspec_uncached_input: null,
      observed_atlaspec_uncached_input: null,
      additional_uncached_input_reduction_required: null,
      output_only_ceiling_at_equal_input: null,
      gate_reachable_at_equal_input: null,
    },
    edit_survival: {
      direct: emptyRate,
      atlaspec: { ...emptyRate },
      atlaspec_gate: 'insufficient',
    },
    portability: { ...emptyRate, gate: 'insufficient' },
    capability_fail_closed: { ...emptyRate, gate: 'insufficient' },
    repair: {
      attempted_runs: 0,
      first_accepted: 0,
      final_accepted: 0,
      recovered: 0,
      iterations: 0,
    },
    reasons: [...reasons, reason],
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
