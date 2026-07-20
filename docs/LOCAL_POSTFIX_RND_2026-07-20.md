# AtlasBench local post-fix R&D: 2026-07-20

## Verdict

The schema-derived Atlaspec reference produced a large, agent-dependent
improvement. Claude passed both locked local gates. Codex failed the formal
post-fix gates because one remaining reference omission caused scalar values
for array-valued properties. After that omission was fixed, a diagnostic-only
Codex closure probe achieved 12/12 first-attempt acceptance in both the
Atlaspec and Atlaspec-repair conditions with zero repairs.

This is evidence that the observed generation defects can be closed by a more
precise IR reference. It is not yet an agent-independent performance claim.
The formal Codex post-fix verdict remains **fail**; the later closure probe had
no direct baseline, used one repetition, and must not retroactively replace
the locked gate result.

## R&D changes

1. `7ab1a27` aligned ordinal heatmap weights with the frozen corpus and
   compressed redundant AJV literal-union diagnostics for repair prompts.
2. `3e15344` replaced the hand-maintained agent reference with output generated
   from the live TypeBox schema. It enumerates exact keys, enums, family
   contracts, and invalid-key exclusions observed in the failed qualification.
3. `b536723` made Vega-Lite compiler warnings acceptance failures so an output
   cannot pass after the renderer silently drops an encoding.
4. `6863909` froze a balanced 12-task post-fix slice disjoint from the original
   qualification and the rotated holdout.
5. `2df52bc` made array, tuple, and metadata scalar value shapes explicit after
   the Codex post-fix failure audit.
6. `428f69c` added a diagnostic Codex probe over the final unused development
   variant.

All tests, type checks, frozen corpus checks, and generated-reference freshness
checks passed before measurement. The 12-task holdout was not exposed.

## Formal post-fix measurement

- Bundle: `work/local-postfix-v1`
- Frozen compiler commit: `6863909e5e23d9e79215391cb337b43d2fac4c69`
- Scope: within-agent local coding-agent comparison only
- Tasks: 12 development-visible tasks, balanced across four families, three
  difficulties, and four variants
- Repetitions: 2
- Conditions: direct MapLibre, direct Vega-Lite where applicable, Atlaspec,
  and Atlaspec with one repair opportunity
- Completion: 6/6 shards, 180/180 runs, 0 invalid shards
- Local tools: Codex CLI 0.144.4 and Claude Code 2.1.17
- Resolved Claude model: `claude-opus-4-5-20251101`
- Resolved Codex model and Codex charge: unreported

### Condition results

| Agent | Condition | First accepted | Final accepted | Output tokens | Repairs |
|---|---:|---:|---:|---:|---:|
| Codex | direct MapLibre | 22/24 (91.7%) | 22/24 | 32,512 | 0 |
| Codex | direct Vega-Lite | 12/18 (66.7%) | 12/18 | 29,687 | 0 |
| Codex | Atlaspec | 8/24 (33.3%) | 8/24 | 8,480 | 0 |
| Codex | Atlaspec repair | 6/24 (25.0%) | 24/24 | 13,618 | 18 |
| Claude | direct MapLibre | 24/24 (100%) | 24/24 | 14,066 | 0 |
| Claude | direct Vega-Lite | 11/18 (61.1%) | 11/18 | 9,389 | 0 |
| Claude | Atlaspec | 24/24 (100%) | 24/24 | 7,722 | 0 |
| Claude | Atlaspec repair | 23/24 (95.8%) | 24/24 | 8,094 | 1 |

The paired baseline selected for both agents was direct MapLibre.

### Locked gates

| Metric | Codex | Claude |
|---|---:|---:|
| Baseline reliable map yield | 91.7% | 100% |
| Atlaspec reliable map yield | 33.3% | 100% |
| Absolute yield delta, 95% CI | -58.3 pp `[-79.2, -37.5]` | 0 pp `[0, 0]` |
| Baseline output tokens / accepted map | 1,477.8 | 586.1 |
| Atlaspec output tokens / accepted map | 1,060.0 | 321.8 |
| Output-token reduction, 95% CI | 28.3% `[-55.7, 55.0]` | 45.1% `[39.1, 50.2]` |
| Yield gate | **fail** | **pass** |
| Output-token gate | **fail** | **pass** |
| Combined verdict | **fail** | **pass** |

For Claude, total tokens per accepted map were 4.5% worse because the exhaustive
reference increased input size, while uncached tokens were 18.5% better and
latency per accepted map was 44.4% better. For Codex, the low accepted count
made total and uncached tokens per accepted map much worse. Absolute token
counts are not comparable between Codex and Claude because their CLI accounting
and cache reporting differ.

Direct Vega-Lite results are stricter than in the original qualification. The
post-fix evaluator rejects compiler warnings such as dropped incompatible
channels and ignored scale bindings. Therefore the direct Vega-Lite before/after
yield difference must not be attributed to model drift alone.

## Residual failure and closure probe

In the Codex formal post-fix Atlaspec condition, 16/24 outputs failed. The
dominant cause was `constraints.label_priority`: Codex emitted `name` or `true`
where the schema requires an array such as `[name]`. One output also placed
arrays in `metadata`, whose values are restricted to string, number, or boolean.
The repair condition recovered all 18 failed first attempts to 24/24 final
acceptance, showing that the diagnostics were actionable.

The reference was then amended to state the collection shapes explicitly. A
fresh diagnostic probe used the third development variant after each rotated
holdout, disjoint from both earlier 12-task slices.

- Probe: `work/local-codex-closure-v1`
- Frozen compiler commit: `428f69cb0c2ff9107d2e221a512100db36c27c44`
- Manifest SHA-256:
  `83e37220c179689f9cb3cc1b24b7bfef42f1368ed55b25709f1bb4ec34a3a2f1`
- Completion: 24/24 runs
- Atlaspec: 12/12 first accepted, 4,253 output tokens
- Atlaspec repair: 12/12 first accepted, 4,123 output tokens, 0 repairs
- Repeated `label_priority` or metadata type failures: 0

The plan, manifest file, and report hashes matched, and the plan/report compiler
commits matched. This closes the specific residual defect on the remaining
development data, but it is a diagnostic result rather than a performance gate.

## Claim boundary and next decision

All 36 development tasks have now participated in qualification or R&D. They
can still be used for engineering regression tests, but not as fresh evidence.
The 12-task holdout remains sealed. Before opening it, freeze the current schema,
reference generator, evaluator warning policy, adapters, model identities,
thresholds, and analysis code. The holdout should then be run once and reported
regardless of outcome.

The strongest defensible statement today is:

> With an exhaustive schema-derived reference, Claude matched direct MapLibre
> reliability and reduced output tokens per accepted map by 45.1% on the locked
> post-fix development slice. Codex did not pass that formal slice, but a later
> diagnostic fix eliminated its identified collection-shape failure on the
> final unused development slice. Holdout confirmation is still required.
