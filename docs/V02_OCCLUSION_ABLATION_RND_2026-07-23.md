# AtlasBench 0.2 proportional-label occlusion ablation

Date: 2026-07-23

## Status and question

This is a post-failure, development-only R&D experiment. It asks whether the
four Atlaspec MapLibre failures found by the locked point-symbol occlusion gate
can be removed by changing either:

1. the agent-declared `capacity` range from its observed value to the compiler
   reference range `[0, 10000]`; or
2. the proportional-symbol label offset from the historical 1.2 em baseline
   to a 3 em maximum-radius clearance.

It does not estimate unseen performance. The failed task and all four outputs
had already been inspected before the arms were defined.

## Design

The experiment uses the two preserved Claude and two preserved Codex outputs
for
`choropleth-proportional-symbols-basic-geographic-capability-boundary`.
It crosses range and clearance in a 2 x 2 design:

| Arm | Capacity range | Label offset |
|---|---|---:|
| observed | preserved agent declaration | 1.2 em |
| reference-range | `[0, 10000]` | 1.2 em |
| maximum-clearance | preserved agent declaration | 3 em |
| reference-range-maximum-clearance | `[0, 10000]` | 3 em |

All four arms rotate through all four execution positions. The runner
explicitly injects both label offsets, so the historical failed baseline
remains reproducible even after the compiler itself is hardened. Inputs are
cloned before treatment, all images are rendered by the real offline MapLibre
browser path, and the previously locked occlusion gate is applied unchanged.

## Result

| Arm | Passed | Maximum box coverage | Maximum glyph coverage |
|---|---:|---:|---:|
| observed | 0/4 | 19.61% | 10.46% |
| reference-range | **4/4** | 0% | 0% |
| maximum-clearance | **4/4** | 0% | 0% |
| reference-range-maximum-clearance | **4/4** | 0% | 0% |

Both single-factor interventions were sufficient for these four cases. The
experiment therefore rejects the claim that only one of the two factors could
remove the observed overlap; it does not identify a unique cause.

The compiler intervention uses maximum-radius clearance rather than rewriting
the declared range. Changing an authored field domain would silently alter the
agent's semantic input. A 3 em clearance instead preserves that input and
accounts for the compiler's 28 px maximum circle radius and 12 px text size.

## Follow-up learned during implementation

An initial implementation made the offset vary with each feature's own symbol
size. It recovered only one of the four failures. The three remaining images
were identical and failed at 10.46% glyph coverage. A small feature's label can
occlude a nearby large feature, so own-feature radius is not sufficient for
cross-feature clearance. The compiler was consequently changed to the
experimentally successful 3 em maximum-radius minimum.

This failed intermediate is retained as evidence against smoothing the R&D
story after seeing the result.

## Provenance

- Clean evaluator commit:
  `3e17b1cf87b2b00681ff3b8cd19201c8dc926afd`.
- Evaluator dirty state: `false`.
- Report:
  `work/v02-occlusion-ablation-v2/ablation.json`.
- Report SHA-256:
  `b331cb98f7b156850ab879dd55a91d493d07cd67da6e79745d3ad4c8aecd3086`.
- Claude source report SHA-256:
  `980a33679362976d79311ebec0c855b778dfff38873ec9507c910caaa23cd8a7`.
- Codex source report SHA-256:
  `280ca5b18240abb96eeee0c19049954d915cb496649fc7930669f05b419ae524`.
- Occlusion-gate SHA-256:
  `7be62df4efb0ddeacdc4dbc8c9763bc74f0c5b0a28a13ccc05052bf4d9558800`.
- Browser: Google Chrome `150.0.7871.115`.
- Split: development.
- Holdout exposed: `false`.

## Reproduction

```powershell
npm run benchmark:v02:rnd:occlusion-ablation -- `
  --report work/v02-qualification-v2/reports/claude/basic.json `
  --report work/v02-qualification-v2/reports/codex/basic.json `
  --output work/v02-occlusion-ablation-v2
```

The output directory is immutable; use a new path for a new run.

## Claim boundary

This is causal engineering evidence for four preserved outputs in one reused
development task. It does not prove that 3 em is optimal across viewports,
symbol ranges, fonts, or datasets, and it is not a replacement for the sealed
v0.2 holdout, external model reproduction, or human cartographic review.
