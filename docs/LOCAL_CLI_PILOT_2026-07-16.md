# Local coding-agent pilot: 2026-07-16

This note freezes the first exploratory AtlasBench run through the locally
authenticated Codex and Claude coding-agent CLIs. It is a development-visible
diagnostic, not evidence for the locked 48-task comparative claim.

## Provenance

- corpus: `local-cli-choropleth-pilot`, one canonical choropleth, one repetition;
- conditions: direct MapLibre, direct Vega-Lite, Atlaspec, Atlaspec with one repair;
- compiler commit: `1b54fa4eef67998595e8700614c5abec73caceb5`;
- prepared-manifest digest: `b20bf0ad1a8c209256b1c1e50d3132a6244c2e0c14b7fe877d7fbe2f88ecfc5f`;
- Codex CLI: `codex-cli 0.144.4`, resolved model and monetary cost unreported;
- Claude Code: `2.1.17`, resolved model `claude-opus-4-5-20251101`.

The local adapters disabled persistence, write-capable tools, and filesystem
inspection. Each CLI still injected its own coding-agent system context, so
these results are not interchangeable with raw API model results.

## Results

| Condition | Codex accepted | Codex output tokens | Codex latency | Claude accepted | Claude output tokens | Claude latency | Claude charge |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| direct MapLibre | 0/1 | 855 | 25.7 s | 0/1 | 1,055 | 18.5 s | $0.1436525 |
| direct Vega-Lite | 1/1 | 1,064 | 31.9 s | 0/1 | 691 | 9.7 s | $0.03728325 |
| Atlaspec | 0/1 | 257 | 11.1 s | 0/1 | 294 | 4.7 s | $0.0296520 |
| Atlaspec plus repair | 0/1 | 518 | 21.9 s | 0/1 | 588 | 12.9 s | $0.0487735 |

Claude reported a total experiment charge of `$0.25936125`. Codex charges are
unknown, not zero; the report uses zero only as a schema placeholder and marks
the cost gate insufficient.

## Failure evidence

- Codex direct MapLibre produced a symbol `text-field` without the required
  root `glyphs` property.
- Codex Atlaspec added unsupported legend keys. The no-repair output placed
  `legend` under `encoding.color`; the repair run placed it at the document root
  and repeated it after receiving the validator diagnostic.
- Claude wrapped every artifact in a Markdown JSON or YAML fence. The strict
  artifact parsers rejected the first backtick, before renderer validation.
- The deterministic compiler smoke suite accepted all four checked-in Atlaspec
  fixtures, separating the model-facing authoring failure from compiler health.

## Interpretation boundary

The single accepted direct Vega-Lite result and zero accepted Atlaspec results
mean this pilot does not show an Atlaspec reliability advantage. Atlaspec used
fewer output tokens and less generation time for the first attempt, but an
invalid artifact cannot support a cost or latency-efficiency claim.

The observations justify development changes to the generation references and
local CLI output contract. Any rerun after those changes must be labeled a
post-observation regression, not pooled with this pilot or presented as an
unbiased holdout result.
