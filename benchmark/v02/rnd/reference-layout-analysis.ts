import type { V02RunRecord } from '../experiment.js';

export type RndGateStatus = 'pass' | 'fail' | 'insufficient';

export interface ReferenceLayoutThresholds {
  first_attempt_yield_per_arm: number;
  eligible_edit_survival_per_arm: number;
  compact_uncached_input_reduction_within_layout: number;
  reference_first_uncached_input_noninferiority_margin: number;
  output_token_regression_margin: number;
}

interface UsageMetric {
  uncached_input_per_accepted_map: number | null;
  output_per_accepted_map: number | null;
  total_per_accepted_map: number | null;
  cached_input_per_response: number | null;
  complete: boolean;
}

interface ArmMetric {
  runs: number;
  first_accepted: number;
  first_yield: number | null;
  edit_eligible: number;
  edit_accepted: number;
  edit_survival: number | null;
  transport_failures: number;
  usage: UsageMetric;
  reliability_gate: RndGateStatus;
  edit_gate: RndGateStatus;
}

interface PairMetric {
  baseline: string;
  candidate: string;
  uncached_input_reduction: number | null;
  output_token_regression: number | null;
  input_gate: RndGateStatus;
  output_gate: RndGateStatus;
}

export interface ReferenceLayoutAnalysis {
  status: RndGateStatus;
  arms: Record<string, ArmMetric>;
  compact_effect: {
    data_first: PairMetric;
    reference_first: PairMetric;
  };
  layout_effect: {
    full: PairMetric;
    compact: PairMetric;
  };
  reasons: string[];
}

const ARM_IDS = [
  'full-data-first',
  'full-reference-first',
  'compact-data-first',
  'compact-reference-first',
] as const;

export function analyzeReferenceLayoutRuns(
  runs: readonly V02RunRecord[],
  thresholds: ReferenceLayoutThresholds,
): ReferenceLayoutAnalysis {
  const arms = Object.fromEntries(
    ARM_IDS.map((id) => [id, armMetric(runs.filter((run) => run.variant_id === id), thresholds)]),
  ) as Record<(typeof ARM_IDS)[number], ArmMetric>;
  const compactData = compare(
    'full-data-first',
    'compact-data-first',
    arms,
    thresholds.compact_uncached_input_reduction_within_layout,
    thresholds.output_token_regression_margin,
  );
  const compactReference = compare(
    'full-reference-first',
    'compact-reference-first',
    arms,
    thresholds.compact_uncached_input_reduction_within_layout,
    thresholds.output_token_regression_margin,
  );
  const fullLayout = compare(
    'full-data-first',
    'full-reference-first',
    arms,
    -thresholds.reference_first_uncached_input_noninferiority_margin,
    thresholds.output_token_regression_margin,
  );
  const compactLayout = compare(
    'compact-data-first',
    'compact-reference-first',
    arms,
    -thresholds.reference_first_uncached_input_noninferiority_margin,
    thresholds.output_token_regression_margin,
  );
  const gates = [
    ...Object.values(arms).flatMap((arm) => [arm.reliability_gate, arm.edit_gate]),
    compactData.input_gate,
    compactData.output_gate,
    compactReference.input_gate,
    compactReference.output_gate,
    fullLayout.input_gate,
    fullLayout.output_gate,
    compactLayout.input_gate,
    compactLayout.output_gate,
  ];
  const reasons = [
    'Token comparisons are paired by task and remain within one agent.',
    'A missing generation response makes every comparison involving that arm insufficient.',
    'Transport failures remain in the first-attempt reliability denominator.',
  ];
  return {
    status: combine(gates),
    arms,
    compact_effect: { data_first: compactData, reference_first: compactReference },
    layout_effect: { full: fullLayout, compact: compactLayout },
    reasons,
  };
}

function armMetric(
  runs: readonly V02RunRecord[],
  thresholds: ReferenceLayoutThresholds,
): ArmMetric {
  const initial = runs.map((run) => run.attempts.find((attempt) => attempt.stage === 'initial'));
  const responses = initial.flatMap((attempt) =>
    attempt?.response === undefined ? [] : [attempt.response],
  );
  const firstAccepted = runs.filter((run) => run.first_attempt_accepted).length;
  const editEligible = runs.filter((run) => run.final_accepted).length;
  const editAccepted = runs.filter((run) => run.edit?.accepted === true).length;
  const firstYield = runs.length === 0 ? null : firstAccepted / runs.length;
  const editSurvival = editEligible === 0 ? null : editAccepted / editEligible;
  const complete = runs.length > 0 && responses.length === runs.length;
  const perAccepted = (metric: (response: (typeof responses)[number]) => number) =>
    !complete || firstAccepted === 0
      ? null
      : sum(responses.map(metric)) / firstAccepted;
  const cachedPerResponse = complete
    ? sum(responses.map((response) => response.usage.cached_input_tokens ?? 0)) /
      responses.length
    : null;
  return {
    runs: runs.length,
    first_accepted: firstAccepted,
    first_yield: firstYield,
    edit_eligible: editEligible,
    edit_accepted: editAccepted,
    edit_survival: editSurvival,
    transport_failures: initial.filter((attempt) => attempt?.response === undefined).length,
    usage: {
      uncached_input_per_accepted_map: perAccepted(
        (response) =>
          response.usage.input_tokens - (response.usage.cached_input_tokens ?? 0),
      ),
      output_per_accepted_map: perAccepted((response) => response.usage.output_tokens),
      total_per_accepted_map: perAccepted(
        (response) =>
          response.usage.input_tokens -
          (response.usage.cached_input_tokens ?? 0) +
          response.usage.output_tokens,
      ),
      cached_input_per_response: cachedPerResponse,
      complete,
    },
    reliability_gate: rateGate(firstYield, thresholds.first_attempt_yield_per_arm),
    edit_gate: rateGate(editSurvival, thresholds.eligible_edit_survival_per_arm),
  };
}

function compare(
  baselineId: string,
  candidateId: string,
  arms: Record<string, ArmMetric>,
  inputThreshold: number,
  outputMargin: number,
): PairMetric {
  const baseline = arms[baselineId]!.usage;
  const candidate = arms[candidateId]!.usage;
  const inputReduction = reduction(
    baseline.uncached_input_per_accepted_map,
    candidate.uncached_input_per_accepted_map,
  );
  const outputRegression = regression(
    baseline.output_per_accepted_map,
    candidate.output_per_accepted_map,
  );
  return {
    baseline: baselineId,
    candidate: candidateId,
    uncached_input_reduction: inputReduction,
    output_token_regression: outputRegression,
    input_gate: inputReduction === null ? 'insufficient' : inputReduction >= inputThreshold ? 'pass' : 'fail',
    output_gate: outputRegression === null ? 'insufficient' : outputRegression <= outputMargin ? 'pass' : 'fail',
  };
}

function rateGate(value: number | null, threshold: number): RndGateStatus {
  return value === null ? 'insufficient' : value >= threshold ? 'pass' : 'fail';
}

function reduction(baseline: number | null, candidate: number | null): number | null {
  return baseline === null || candidate === null || baseline === 0
    ? null
    : (baseline - candidate) / baseline;
}

function regression(baseline: number | null, candidate: number | null): number | null {
  return baseline === null || candidate === null || baseline === 0
    ? null
    : (candidate - baseline) / baseline;
}

function combine(gates: readonly RndGateStatus[]): RndGateStatus {
  if (gates.includes('fail')) return 'fail';
  if (gates.includes('insufficient')) return 'insufficient';
  return 'pass';
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
