# AtlasBench 0.2 symmetric-repair development pilot

Date: 2026-07-27

## Status and question

This is a small, post-protocol **development-only R&D pilot**. It asks whether
Atlaspec's observed advantage survives when direct MapLibre and Vega-Lite
generation receive the same deterministic diagnostics and maximum one repair
opportunity.

It is not a preregistered benchmark, does not use the sealed v0.2 holdout, and
is too small to support a release or general-superiority claim.

## Design

- Evaluator commit: `959d3c0704926633346d7d9675e8fe6ca486b769`.
- Manifest SHA-256:
  `36a7adf1e5a8535723fa05a3da0b7cdd4556cf7d6ec9a8b22470ec42880492da`.
- Agents: Codex CLI `0.144.4` with its default model, and Claude Code `2.1.17`
  resolving `opus` to `claude-opus-4-5-20251101`.
- Split: development.
- Tasks: six selected after a one-task runner smoke test.
- Repetitions: one.
- MapLibre pairs: six per agent.
- Vega-Lite pairs: three per agent because capability-negative tasks do not
  declare a Vega-Lite target.
- Repair budget: the same failed deterministic checks and at most one complete
  replacement for both direct-renderer and Atlaspec conditions.
- Holdout exposed: `false`.

The six tasks cover representable and capability-negative compositions,
basic/intermediate/adversarial difficulty, and missing/skew,
dense-multilingual-mobile, and geographic-capability-boundary stress.

## Accepted-output result

### MapLibre

| Agent | Condition | First attempt | After at most one repair |
| --- | --- | ---: | ---: |
| Codex | Direct MapLibre | 6/6 | 6/6 |
| Codex | Atlaspec → MapLibre | 6/6 | 6/6 |
| Claude | Direct MapLibre | 5/6 | 6/6 |
| Claude | Atlaspec → MapLibre | 6/6 | 6/6 |

The symmetric repair erased the observed MapLibre final-yield difference in
this pilot. Claude direct MapLibre used one repair; the other three MapLibre
arms did not.

### Vega-Lite

| Agent | Condition | First attempt | After at most one repair |
| --- | --- | ---: | ---: |
| Codex | Direct Vega-Lite | 1/3 | 1/3 |
| Codex | Atlaspec → Vega-Lite | 3/3 | 3/3 |
| Claude | Direct Vega-Lite | 1/3 | 2/3 |
| Claude | Atlaspec → Vega-Lite | 3/3 | 3/3 |

Direct Vega-Lite invoked repair in two of three runs for each agent. Two Codex
runs and one Claude run still failed compilation or warning gates after the
repair. The Atlaspec arms needed no repair.

The paired final-yield delta was `0` for MapLibre. It was `+0.67` for Codex
Vega-Lite and `+0.33` for Claude Vega-Lite, but each deterministic
paired-bootstrap 95% interval was `[0, 1]`. Three pairs are far too few for a
stable accuracy estimate.

## Output-token result

Output-token values are compared only within the same agent.

| Agent and renderer | Direct per run | Atlaspec per run | Atlaspec reduction |
| --- | ---: | ---: | ---: |
| Codex MapLibre | 1,773.3 | 522.2 | 70.6% |
| Codex Vega-Lite | 3,592.7 | 449.7 | 87.5% |
| Claude MapLibre | 964.3 | 471.8 | 51.1% |
| Claude Vega-Lite | 1,181.0 | 437.7 | 62.9% |

Repairs are included in the direct totals. The output-size advantage remained
large in this pilot, including where final MapLibre yield tied.

Claude reported a total charge of `$0.8861` across 21 calls. Its Atlaspec
charges were lower within both renderer strata, but this exploratory sample is
not large enough for a cost claim. Codex CLI did not report monetary cost or
the resolved underlying model.

| Agent and renderer | Latency reduction | Observed charge reduction |
| --- | ---: | ---: |
| Codex MapLibre | 61.1% | unavailable |
| Codex Vega-Lite | 84.8% | unavailable |
| Claude MapLibre | 55.2% | 28.0% |
| Claude Vega-Lite | 62.0% | 59.0% |

Latency and charge include repair calls. They are exploratory operational
measurements from this machine and provider session, not portable model
benchmarks.

## What changed in the interpretation

This pilot weakens any claim that the prior direct MapLibre failures establish
an inherent Atlaspec accuracy advantage. With official validation feedback and
one retry, direct MapLibre reached the same final yield on these six tasks.

It still supports two narrower hypotheses for a properly powered experiment:

1. Atlaspec may reduce output tokens and repair demand even when final accepted
   yield ties.
2. Atlaspec's fail-closed portable subset may retain a reliability advantage
   for more complex Vega-Lite compositions.

Neither hypothesis is confirmed by this pilot.

## Provenance

The reports remain under the git-ignored `work/` directory.

| Artifact | SHA-256 |
| --- | --- |
| `work/v02-symmetric-repair-codex-stratified.json` | `603d909ef3654a4bddd858538b9c72eccb9d372a3df2dadffcb6e9f3c0b06d98` |
| `work/v02-symmetric-repair-codex-stratified.analysis.v2.json` | `4e63ee322bdfceeb65b16c97283e1d5c5d1f1e349e3967d59e850a8434ef3eb7` |
| `work/v02-symmetric-repair-claude-stratified.json` | `ec0c1d7c6b8587bda24ba1e3172e2937bf9dfceba1369599a9ad04bd0c7f4497` |
| `work/v02-symmetric-repair-claude-stratified.analysis.v2.json` | `70ba19907fc080669611686ee84f15230a6cf1a5485562cb5438525fa468ac05` |

## Claim boundary and next experiment

Do not merge the two agents into 12 or six independent observations: the tasks
are shared and the agent runs are correlated. Do not present the Vega-Lite
point estimates without the three-pair denominator and `[0, 1]` interval.

The next defensible step is to freeze an adequately powered development
protocol before any more outputs are inspected, retain renderer-specific
strata, and reserve the sealed holdout for the eventual confirmatory run.
