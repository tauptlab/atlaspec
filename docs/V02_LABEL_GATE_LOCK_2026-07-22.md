# AtlasBench 0.2 MapLibre label-gate lock

Date: 2026-07-22

## Status

The label thresholds in
`benchmark/v02/visual-gates-v1.json` are locked before applying them to the
preserved model outputs. The calibration used only the 36 development compiler
references. The 12-task holdout was not rendered or exposed.

Calibration provenance:

- clean evaluator commit:
  `d833ad9f09f3a8a03ece067d69b9e371889bf7ee`;
- calibration report:
  `work/v02-label-calibration-v1/calibration.json`;
- calibration report SHA-256:
  `b10a423ea3901b8debc93a22fd62a2e81734d2faab29756e1300d1877645361d`;
- development reference tasks: 36/36 basic render-health pass;
- recorded holdout state: `holdout_exposed: false`.

## Reference observations

| Variant | Reference minimum coverage | Reference median coverage | Minimum label pixels | Maximum edge ratio |
|---|---:|---:|---:|---:|
| canonical | 50% | 50% | 63 | 0% |
| missing-and-skew | 50% | 50% | 63 | 0% |
| dense-multilingual-mobile | 16.67% | 16.67% | 127 | 0% |
| geographic-capability-boundary | 0% | 16.67% | 1 | 0% |

The single 0%-coverage geographic reference rendered a cluster-count glyph
while all six authored point labels were hidden by the locked clustering rule.
It is therefore treated as a semantic-zoom fallback, not as proof that zero
visible text is generally acceptable.

## Locked rules

The model-output pass requires all of the following in addition to basic
renderer health:

- at least one MapLibre text layer;
- candidate-backed label coverage of at least 1/3 for canonical and
  missing-and-skew variants;
- coverage of at least 1/6 for dense-multilingual-mobile and geographic
  variants;
- at least 31 label-only sampled pixels for canonical and missing-and-skew;
- at least 63 for dense multilingual and 10 for geographic;
- no more than 2% of label pixels in the four-pixel sampled viewport edge;
- zero rendered-label duplicates beyond unique queried values.

One fallback is allowed only for the geographic variant: a rendered
`point_count` text layer and at least one label pixel may substitute for the
coverage and pixel thresholds. Edge and duplicate gates still apply.

The 1/3 thresholds give the 50% reference minimum a one-label noninferiority
margin. The dense/geographic 1/6 threshold requires at least one of six authored
labels. Pixel minima are approximately half the reference minimum, except for
the explicitly separated cluster fallback. These choices are fixed before
model-output reclassification and must not be relaxed after seeing it.

## Claim boundary

The gates establish that text is locally rendered, collision-aware, bounded by
the source candidate count, not duplicated, and not concentrated at the
viewport edge. They do not establish correct semantic label priority, readable
font size for humans, absence of label-symbol overlap, or expert cartographic
quality. Those remain separate deterministic and human-study gates.
