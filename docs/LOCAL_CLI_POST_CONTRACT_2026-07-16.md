# Local coding-agent post-contract regression: 2026-07-16

This is the labeled post-observation rerun of the one-task local CLI pilot. It
tests whether the generation-contract changes in commit
`0532ba92dd5a5de50d78fa554a2d4605ae5fbd1e` eliminate the specific failures
recorded in `LOCAL_CLI_PILOT_2026-07-16.md`.

It is not an unbiased benchmark result and must not be pooled with the locked
48-task experiment. The task was visible during development, the references
were changed in response to its failures, and each condition has one sample.

## Changes under test

- put a format-specific output contract after every local CLI input;
- require JSON to start with `{` and end with `}` without Markdown wrappers;
- require Atlaspec YAML to start with `version:` without wrappers or markers;
- document the MapLibre root `glyphs` requirement for text symbols;
- state that Atlaspec legend metadata is compiler-derived and that authored
  `legend` keys are invalid.

The validators remained strict. The adapters did not strip fences, repair JSON
or YAML, or remove unsupported keys after generation.

## Provenance

- corpus: `local-cli-choropleth-pilot`, one canonical choropleth, one repetition;
- compiler commit: `0532ba92dd5a5de50d78fa554a2d4605ae5fbd1e`;
- Codex prepared-manifest digest: `b20bf0ad1a8c209256b1c1e50d3132a6244c2e0c14b7fe877d7fbe2f88ecfc5f`;
- Claude prepared-manifest digest: `43961e2ff0c7fa986b7dc1fd67e4fed8d13f7a76418fb04529237794643180c1`;
- Codex CLI: `codex-cli 0.144.4`, model and monetary cost unreported;
- Claude Code: `2.1.17`, model `claude-opus-4-5-20251101`.

## Results

| Condition | Codex accepted | Codex output tokens | Codex latency | Claude accepted | Claude output tokens | Claude latency | Claude charge |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| direct MapLibre | 1/1 | 944 | 21.1 s | 1/1 | 475 | 8.1 s | $0.1304650 |
| direct Vega-Lite | 1/1 | 1,140 | 23.5 s | 1/1 | 544 | 7.4 s | $0.03412975 |
| Atlaspec | 1/1 | 245 | 9.5 s | 1/1 | 279 | 7.1 s | $0.03045475 |
| Atlaspec plus repair | 1/1 | 243 | 7.6 s | 1/1 | 288 | 6.0 s | $0.01686250 |

All eight generated artifacts passed strict parsing, Atlaspec compilation where
applicable, official renderer validation, required layer checks, and declared
decision checks. Both `atlaspec-repair` runs passed on their first attempt, so
they performed zero repairs and must not be interpreted as repair evidence.

The Claude experiment charge was `$0.211912`. Codex cost remains unavailable.

## Directional comparison

Against the cheaper accepted Claude direct baseline, Vega-Lite, Atlaspec cost
10.8% less (`$0.03045475` versus `$0.03412975`). This misses the locked 25%
cost-reduction gate, so the automated report is `fail` even though the primary
yield non-inferiority gate passes. Codex's cost gate is insufficient.

For the first-attempt Atlaspec condition:

- Codex emitted 74.0% fewer output tokens than MapLibre and 78.5% fewer than
  Vega-Lite; its recorded generation latency was 54.7% and 59.4% lower;
- Claude emitted 41.3% fewer output tokens than MapLibre and 48.7% fewer than
  Vega-Lite; its recorded latency was 12.6% and 3.5% lower.

These are directional measurements, not confidence-bounded claims. Claude's
first condition paid cache-creation cost while later conditions used cache
reads, and fixed condition order can confound cost and latency. The comparable
Vega-Lite and Atlaspec runs both reported 16,892 cached input tokens, but one
sample is still insufficient for an efficacy claim.

## Regression conclusion

The exact observed failure signatures disappeared: MapLibre outputs included
`glyphs`, Atlaspec outputs omitted unsupported legend keys, and Claude emitted
bare artifacts without Markdown fences. Acceptance improved from 1/4 to 4/4
for Codex and from 0/4 to 4/4 for Claude.

This establishes that the clarified contract fixes the local development
regression. It does not yet establish that Atlaspec outperforms direct formats;
that requires the frozen multi-task, repeated, multi-model evaluation and the
locked human-review gates.
