# AtlasBench local holdout result: 2026-07-20

## Verdict

The one-time local holdout execution completed with 6/6 valid shards and
450/450 runs. Atlaspec achieved 60/60 first-attempt accepted maps for both
Codex and Claude. The best direct baseline was MapLibre at 54/60 for each
agent. Both agents passed the locked local Reliable Map Yield and output-token
gates.

This confirms the local-agent result on the frozen holdout. It is not the full
AtlasBench product verdict: Codex charge was unavailable, the local cost gate
uses output tokens as its locked proxy, hosted model strata were not run, and
human, expert, edit-survival, and renderer-level visual evaluations remain
outstanding.

## Frozen provenance

- Lock: `docs/LOCAL_HOLDOUT_LOCK_2026-07-20.md`
- Bundle: `work/local-holdout-v1`
- Benchmark ID: `atlasbench-local-holdout-v1`
- Generated at: `2026-07-20T04:37:05.425Z`
- Compiler commit: `70b5656ff8589bfe584d406c1ba0e36e6567d2a5`
- Dependency lock SHA-256:
  `3e7dbbc86a3b580a613f2429cadc301b88999bb33f9b80870183c6a975f867dc`
- Holdout manifest SHA-256:
  `68698c1a8f5602188e7d63e9a009c4f483d5415278a6cdd34103d2931fde3c9f`
- Corpus matrix SHA-256:
  `d1f8a50a4a416ae2fd0e2a5b0b345484275fb8d8a9b3c5ba2d4569545f09da2a`
- Codex CLI: `codex-cli 0.144.4`; resolved model and charge unreported
- Claude Code: `2.1.17`; resolved model
  `claude-opus-4-5-20251101`
- Tasks: 12 frozen rotated holdout tasks
- Repetitions: 5
- Execution order: balanced
- Completion: 6/6 shards, 450/450 runs, 0 invalid shards

Every completed job had the planned 75 runs. The status verifier found no
manifest digest, compiler commit, run ID, model identity, cost-observation, or
run-count mismatch. No source, schema, compiler, reference, evaluator, adapter,
threshold, analysis, or lockfile change occurred between bundle preparation and
completion.

## Condition results

| Agent | Condition | First accepted | Final accepted | Output tokens | Repairs |
|---|---:|---:|---:|---:|---:|
| Codex | direct MapLibre | 54/60 (90.0%) | 54/60 | 84,434 | 0 |
| Codex | direct Vega-Lite | 26/45 (57.8%) | 26/45 | 79,624 | 0 |
| Codex | Atlaspec | 60/60 (100%) | 60/60 | 21,258 | 0 |
| Codex | Atlaspec repair | 60/60 (100%) | 60/60 | 21,513 | 0 |
| Claude | direct MapLibre | 54/60 (90.0%) | 54/60 | 43,459 | 0 |
| Claude | direct Vega-Lite | 28/45 (62.2%) | 28/45 | 26,725 | 0 |
| Claude | Atlaspec | 60/60 (100%) | 60/60 | 19,605 | 0 |
| Claude | Atlaspec repair | 60/60 (100%) | 60/60 | 19,681 | 0 |

Direct Vega-Lite was evaluated with the locked strict warning policy. An output
failed when Vega-Lite silently dropped an incompatible encoding or otherwise
emitted a compiler warning, even if a Vega runtime specification could still
be produced.

## Locked local gates

The best direct baseline was MapLibre for both agents.

| Metric | Codex | Claude |
|---|---:|---:|
| Paired runs | 60 | 60 |
| Baseline Reliable Map Yield | 90.0% | 90.0% |
| Atlaspec Reliable Map Yield | 100% | 100% |
| Absolute yield delta, 95% CI | +10.0 pp `[+3.3, +18.3]` | +10.0 pp `[+3.3, +18.3]` |
| Relative failure reduction | 100% | 100% |
| Baseline output tokens / accepted map | 1,563.6 | 804.8 |
| Atlaspec output tokens / accepted map | 354.3 | 326.8 |
| Output-token reduction, 95% CI | 77.3% `[74.1, 80.5]` | 59.4% `[51.2, 66.9]` |
| Yield gate | **pass** | **pass** |
| Output-token gate | **pass** | **pass** |
| Combined local automated verdict | **pass** | **pass** |

The paired pass/fail table for each agent contained six MapLibre-fail / 
Atlaspec-pass pairs and zero MapLibre-pass / Atlaspec-fail pairs. A supplemental
two-sided exact McNemar test gives `p = 0.03125` for each agent. This value was
computed after the locked gate and is supporting evidence, not a replacement
or newly introduced gate.

The exact baseline failure rate was 10%. Floating-point evaluation represented
`1 - 0.9` slightly below `0.1`, so the locked implementation reported the
low-failure non-inferiority branch in its reason string. This boundary issue
does not change the verdict: under the contract's ordinary branch, relative
failure reduction is 100%, the yield-delta confidence interval excludes zero
in the favorable direction, and the output-token gate passes for both agents.
The raw locked status is preserved unchanged.

## Cost and latency boundaries

| Metric reduction vs direct MapLibre | Codex | Claude |
|---|---:|---:|
| Total tokens / accepted map | 9.2% better | 7.0% better |
| Uncached tokens / accepted map | 0.9% worse | 39.2% better |
| Latency / accepted map | 63.9% better | 51.6% better |
| Reported charge / accepted map | unavailable | 38.0% better |

Claude's reported charge per accepted map decreased from `$0.0355416` to
`$0.0220331`. Claude reported `$5.7405005` across all four conditions. Codex
reported neither a resolved model identity nor charges, so no monetary Codex
claim is made. Absolute Codex-versus-Claude token counts are prohibited because
their CLI accounting and cache reporting are not equivalent.

The local combined gate uses output tokens per accepted map, as pre-committed
for this continuation. It must not be restated as a demonstrated 25% reduction
in comprehensive cost for Codex: its uncached-token result was slightly worse,
and charge was unavailable.

## Failure audit

Atlaspec and Atlaspec-repair had no first-attempt failures and no repair calls
for either agent.

The six direct MapLibre failures per agent were deterministic style-validation
failures, including:

- embedding a source object where a layer source ID string was required;
- illegal nesting of `zoom` expressions in circle-radius expressions;
- data expressions in properties that do not support them;
- invalid nested arrays in text offsets.

Direct Vega-Lite failures included compile errors, compiler warnings, missing
required mark types, and one Codex transport failure. All remained in the
denominator.

## Claim boundary

The strongest defensible result is:

> On the one-time 12-task, five-repetition local holdout, Atlaspec produced
> valid first-attempt maps in 120/120 runs across Codex and Claude, compared
> with 108/120 for direct MapLibre. Within each agent, Atlaspec improved
> Reliable Map Yield by 10 percentage points and reduced output tokens per
> accepted map by 77.3% for Codex and 59.4% for Claude. Both locked local
> automated gates passed.

This result supports the value of a precise, schema-derived cartographic IR for
local coding agents. It does not yet satisfy the complete pre-committed
AtlasBench success criteria. The holdout is now consumed and must not be used
for further Atlaspec 0.1 tuning or a second confirmation run.
