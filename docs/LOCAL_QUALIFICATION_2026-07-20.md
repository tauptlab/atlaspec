# AtlasBench Local qualification: 2026-07-20

This note freezes the first multi-task, repeated local coding-agent
qualification. It is a within-agent comparison of Atlaspec against direct
renderer authoring, not a raw-model API benchmark. Absolute token counts must
not be compared between Codex and Claude because their tokenizers and injected
agent contexts differ.

## Pre-committed design

- compiler commit: `b503d37`;
- agents: Codex CLI `0.144.4` with resolved model unreported, and Claude Code
  `2.1.17` resolving `claude-opus-4-5-20251101`;
- corpus: 12 development-visible tasks, one per family and difficulty;
- variants: canonical, missing-value, distribution, and geographic stress each
  represented three times;
- repetitions: two;
- conditions: direct MapLibre, direct Vega-Lite where declared, Atlaspec, and
  Atlaspec with one repair opportunity;
- execution: deterministic balanced condition rotation in six restartable
  agent-by-difficulty shards;
- primary gate: locked yield reduction or low-failure non-inferiority rule;
- token gate: at least 25% fewer output tokens per accepted map with a positive
  paired-bootstrap 95% lower bound;
- bootstrap: 10,000 iterations, seed `20260720`;
- holdout exposure: none.

All six shard reports passed their compiler commit, dependency lock, manifest
digest, model identity, exact run-ID, and expected-run-count checks. The final
bundle contains all 180 required condition runs. Repair failures added calls
but did not remove first-attempt failures from the denominator.

## Condition results

| Agent | Condition | First accepted | Final accepted | RMY | Output tokens | Response latency |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Codex | direct MapLibre | 23/24 | 23/24 | 95.8% | 32,879 | 910.7 s |
| Codex | direct Vega-Lite | 15/18 | 15/18 | 83.3% | 32,903 | 908.8 s |
| Codex | Atlaspec | 6/24 | 6/24 | 25.0% | 10,051 | 391.2 s |
| Codex | Atlaspec plus repair | 6/24 | 13/24 | 25.0% | 18,027 | 693.5 s |
| Claude | direct MapLibre | 22/24 | 22/24 | 91.7% | 18,735 | 282.2 s |
| Claude | direct Vega-Lite | 14/18 | 14/18 | 77.8% | 8,767 | 148.5 s |
| Claude | Atlaspec | 4/24 | 4/24 | 16.7% | 7,268 | 145.4 s |
| Claude | Atlaspec plus repair | 4/24 | 14/24 | 16.7% | 13,064 | 240.8 s |

Claude reported `$3.11371375` for the complete qualification. Codex reported
tokens but no monetary charge, so Codex cost remains unavailable rather than
zero.

## Locked gate analysis

The best direct baseline for both agents was MapLibre.

| Metric | Codex | Claude |
| --- | ---: | ---: |
| Baseline RMY | 95.8% | 91.7% |
| Atlaspec RMY | 25.0% | 16.7% |
| Absolute yield delta | -70.8 pp | -75.0 pp |
| 95% CI for yield delta | [-87.5, -54.2] pp | [-91.7, -58.3] pp |
| Baseline output tokens / accepted map | 1,429.5 | 851.6 |
| Atlaspec output tokens / accepted map | 1,675.2 | 1,817.0 |
| Output-token reduction | -17.2% | -113.4% |
| 95% CI for output-token reduction | [-259.4%, 36.1%] | [-757.9%, -8.1%] |
| Yield gate | fail | fail |
| Output-token gate | fail | fail |
| Combined qualification | **fail** | **fail** |

Atlaspec artifacts were individually shorter, but too few were accepted. Once
all failed generations remain in the numerator and only accepted maps form the
denominator, Atlaspec consumed more output tokens per accepted map for both
agents. This is the correct efficiency interpretation for the locked endpoint.

Repair improved final Atlaspec yield from 25.0% to 54.2% for Codex and from
16.7% to 58.3% for Claude. It did not change first-attempt RMY and required 18
Codex and 20 Claude repair calls.

## Failure concentration

Among the 18 failed Codex Atlaspec runs, non-exclusive recurring categories
included unsupported encoding properties in 8 runs, misplaced zoom properties
in 8, invalid `intent.audience` values in 6, and invalid `intent.task` values in
5. Among the 20 failed Claude Atlaspec runs, unsupported encoding properties
appeared in 15, invalid task values in 8, misplaced zoom properties in 8,
invalid audience values in 2, and invalid heatmap weight semantics in 1.

The generation reference showed one minimal example but omitted the exhaustive
allowed `intent.task` and `intent.audience` values. It also did not make the
family-specific encoding shapes and the required `behavior.zoom_rules`
placement sufficiently explicit. The agents repeatedly invented otherwise
reasonable keys such as size scales, palettes, and root or constraint-level
zoom settings that the strict 0.1 schema rejects. This is evidence of a
model-facing language/reference design failure, not merely a compiler failure.

## Evaluator limitations observed

Vega-Lite emitted warnings while still compiling: invalid encoding channels
were dropped, coordinate expressions were removed, scale bindings were ignored,
and conflicting legend settings were resolved implicitly. The current
renderer-depth evaluator does not promote those warnings to failures. It also
does not yet perform screenshot-level legend, label overlap, contrast,
viewport, or projection checks. Direct baseline RMY may therefore be
optimistic, but Atlaspec's schema failures are large enough that this does not
reverse the qualification verdict.

## Decision

Do not spend the much larger 36-task by five-repetition run or expose holdout
under the current Atlaspec 0.1 generation reference. The qualification gates
failed in the same direction for both local agents with confidence intervals
well below non-inferiority.

Preserve this result unchanged. The next development iteration should generate
an exhaustive agent reference directly from the schema, add warning-aware and
visual deterministic checks, and evaluate the changes on unused development
tasks. A post-fix result must be labeled separately and must not overwrite or
pool with this qualification.
