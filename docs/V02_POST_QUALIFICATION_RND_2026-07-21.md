# AtlasBench 0.2 post-qualification R&D

Date: 2026-07-21

## Outcome

The first post-qualification change fixed the four observed generation-reference
omissions without weakening Atlaspec validation or compiler capability checks.
A targeted five-run live regression passed 5/5 on the first attempt:

- Codex: 3/3, including two MapLibre compilations with successful localized
  edits and one Vega-Lite capability control that failed closed correctly.
- Claude: 2/2, including the exact representable task that previously failed
  both repetitions because the model invented semantic zoom.

This is positive R&D evidence, not a replacement for the locked 216-run
qualification. The official development verdict remains fail and the fresh
holdout remains sealed.

## Root-cause analysis

The capability metric had not exposed a permissive compiler defect. Failed
capability-control runs produced schema-invalid Atlaspec before the compiler
could reach its intended unsupported-capability diagnostic. Valid heatmap
documents already failed closed with `vega-lite.unsupported-heatmap`.

The generated 0.2 reference listed the `intent` keys but omitted their exact
enums. It also omitted the color-classification and basemap enums, described
`metadata` without its scalar-only value restriction, and did not tell agents
to omit behavior when a prompt supplied no concrete zoom rule. Models therefore
invented values such as `intent.task: monitor`, copied stress-label arrays into
metadata, or turned a `layer-visibility` label into unsupported semantic zoom.

Failure-check occurrences in rejected first Atlaspec attempts were:

| Agent | Check | Occurrences |
|---|---|---:|
| Codex | `atlaspec.schema.enum` | 36 |
| Codex | `atlaspec.schema.type` | 56 |
| Codex | `atlaspec.schema.anyOf` | 17 |
| Codex | `atlaspec.behavior.zoom-bound-required` | 26 |
| Codex | other unsupported/conflicting zoom behavior | 17 |
| Claude | `atlaspec.schema.enum` | 9 |
| Claude | `atlaspec.vega-lite.unsupported-semantic-zoom` | 4 |
| Claude | `atlaspec.behavior.multiple-visibility-rules` | 1 |

These are diagnostic-check occurrences, not independent run counts; one output
can contribute more than one check.

## Change

Commit `8922af6170412a97b2174d6f6b170500fd58b389` makes the 0.2 generation
reference derive and print:

- exact task and audience enums;
- geometry-support and color-classification enums;
- basemap style and contrast enums;
- string-array constraints and scalar-only metadata values;
- an explicit rule not to copy evaluation stress labels into metadata;
- an explicit rule to omit behavior unless the request gives concrete zoom
  thresholds and actions.

The schema and validators were not relaxed. The generated reference SHA-256 is
`acecbcc4aca9c84dde559793b3ccb0b7ce6b49491efba8b15936f0f01f389ec5`.

## Targeted live regression

The diagnostic used development tasks already observed during qualification.
It was intentionally targeted after inspecting failures and is therefore not
unbiased benchmark evidence.

| Agent | Task | Condition | First attempt | Key result |
|---|---|---|---:|---|
| Codex | `choropleth-categorical-facilities-adversarial-dense-multilingual-mobile` | Atlaspec MapLibre | pass | semantic contract and localized edit passed |
| Codex | `operational-overview-intermediate-geographic-capability-boundary` | Atlaspec MapLibre | pass | semantic contract and localized edit passed |
| Codex | `operational-overview-intermediate-geographic-capability-boundary` | capability negative | pass | `vega-lite.unsupported-heatmap` |
| Claude | `choropleth-proportional-symbols-intermediate-canonical` | Atlaspec Vega-Lite | pass | no invented zoom; portability contract passed |
| Claude | `operational-overview-basic-dense-multilingual-mobile` | capability negative | pass | `vega-lite.unsupported-heatmap` |

The five condition runs used seven model calls because the two successful Codex
MapLibre generations also exercised localized edits. Claude reported
`$0.19762050`; Codex CLI did not report monetary cost.

| Local report | SHA-256 |
|---|---|
| `work/v02-rnd/reference-hardening-codex.json` | `dccd1f64f9f2db1a5e4dd20dfd432b53e41e4933b073ca49862224086857808f` |
| `work/v02-rnd/reference-hardening-claude.json` | `29fecbee9d6f4f6fdbdf1405fc42f8196857cdf7be317df02bfbbd55d074869e` |

## Claim boundary and next gate

The admissible result is:

> The missing grammar constraints explain the selected failures, and the
> hardened reference corrected all five targeted live regressions without
> changing compiler acceptance rules.

It is not yet admissible to claim that the full Codex reliability, portability,
or capability gates now pass. The next measurement must be a newly versioned,
precommitted development qualification. It should retain the same task clusters
for comparability, use fresh balanced repetitions, preserve the prior negative
report, and keep the holdout unopened until every required development gate
passes on both agents.
