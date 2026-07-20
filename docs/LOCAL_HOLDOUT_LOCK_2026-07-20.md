# AtlasBench local holdout lock: 2026-07-20

## Purpose

This lock governs the one-time local Codex and Claude confirmation on the
frozen 12-task AtlasBench holdout. Results are reported regardless of outcome
and are not used to retune Atlaspec 0.1, the agent reference, evaluator,
adapters, thresholds, or analysis code.

This is a local coding-agent confirmation, not the complete official product
gate. Human task accuracy, blind expert review, edit survival, repair-count
comparison, hosted model strata, and raw-API pricing remain outside this run.

## Frozen execution contract

- Corpus: checked-in `atlasbench-48-holdout`
- Tasks: 12, one rotated holdout for each family/difficulty pair
- Agents: local Codex CLI and local Claude Code
- Conditions: direct MapLibre, direct Vega-Lite where representable, Atlaspec,
  and Atlaspec with one repair opportunity
- Repetitions: 5 for every task-condition-agent tuple
- Execution order: balanced
- Shards: 3 difficulty shards per agent, 6 total
- Expected runs: 450
- Base generation calls: 450
- Maximum generation calls: 570
- Holdout use: one execution only
- Cross-agent absolute token comparison: prohibited

The exact CLI versions, resolved model identities, compiler commit, dependency
lockfile digest, source manifest digest, matrix digest, generated shard
manifests, and generation timestamps are written to the prepared
`local-plan.json`. A shard is invalid if its commit, manifest digest, run IDs,
model identity, cost-observation contract, or run count differs from the plan.

## Frozen automated gates

Analysis remains within each agent and compares Atlaspec first attempts with
the best direct baseline.

- Relative failure reduction threshold: 30%
- Output-token reduction per accepted map: 25%
- Low-baseline failure threshold: 10%
- Low-failure yield non-inferiority margin: 3 percentage points
- Confidence level: 95%
- Paired bootstrap iterations: 10,000
- Local continuation bootstrap seed: `20260720`

If the best baseline failure rate is below 10%, the yield gate uses the locked
three-percentage-point non-inferiority rule. Otherwise, the 30% relative failure
reduction applies and the yield-delta confidence interval must exclude zero in
the favorable direction. The output-token point estimate must meet 25%, and
its confidence interval must exclude zero in the favorable direction.

Input, cached, uncached, total, latency, repair, and charge accounting are also
reported, but only the yield and output-token gates are combined by the current
local analysis. This narrower automated verdict must not be described as the
complete AtlasBench product verdict.

## Freeze boundary

The execution commit is the commit containing this lock and the local holdout
sharding support. After that commit:

1. run the full check suite;
2. prepare the holdout bundle from that exact commit;
3. make no source, schema, reference, evaluator, adapter, threshold, lockfile,
   or analysis changes until all six reports are complete;
4. verify all 450 runs fail closed;
5. publish the result without tuning on holdout observations.

The checked-in holdout manifest was accessed during execution preflight to
confirm the frozen five-repetition and condition contract. No holdout model
output existed, and no Atlaspec schema, reference, compiler, evaluator, or gate
was changed based on holdout task content. The first model execution begins
only after this lock is committed.
