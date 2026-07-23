# AtlasBench 0.2 label-to-point-symbol occlusion gate lock

Date: 2026-07-23

## Status

The thresholds in `benchmark/v02/occlusion-gates-v1.json` are locked before
applying them to preserved model outputs. Calibration used only the 36
development compiler references. The 12-task holdout was not rendered or
exposed.

Calibration provenance:

- clean evaluator commit:
  `d3081eb9fa0cc246fb46ead5f55d9209d245ee9f`;
- calibration report:
  `work/v02-occlusion-calibration-v1/calibration.json`;
- calibration report SHA-256:
  `28d1e0a06676be3b07dbd08cfeb984a8d10f42a43ff78e8520e88c72d8e32854`;
- development reference tasks: 36/36 prior-gate pass;
- recorded holdout state: `holdout_exposed: false`.

## Method

The renderer records three quarter-resolution RGB frames from the same stable
MapLibre scene:

1. all layers visible;
2. text symbol layers hidden;
3. text and circle layers hidden.

The first difference isolates label-glyph pixels. The second difference
isolates rendered circle/point-symbol pixels. Each point-symbol pixel is tested
against the placed MapLibre label collision boxes and the label-glyph mask.
An RGB absolute-difference sum of at least 24 marks a changed pixel, matching
the existing label-pixel method.

This is a deterministic layer-isolation measure in the locked browser
environment. It does not infer circle radius from style expressions.

## Reference observations and locked thresholds

| Variant | Minimum point pixels | Maximum box coverage | Locked box maximum | Maximum glyph coverage | Locked glyph maximum |
|---|---:|---:|---:|---:|---:|
| canonical | 70 | 4.60% | 8% | 1.15% | 3% |
| missing-and-skew | 72 | 6.12% | 10% | 3.06% | 6% |
| dense-multilingual-mobile | 10 | 0% | 5% | 0% | 2% |
| geographic-capability-boundary | 9 | 29.41% | 40% | 1.96% | 5% |

The minimum point-symbol pixel floors are 50% of the observed reference
minimum, rounded down: 35, 36, 5, and 4 pixels respectively. The coverage
ceilings retain an absolute margin above each observed maximum. The geographic
allowance is intentionally separate because a cluster-count label is designed
to occupy the cluster circle; applying the canonical threshold would reject
that locked semantic-zoom behavior.

These thresholds are fixed before inspecting preserved model-output occlusion
metrics and must not be relaxed after reclassification.

## Post-lock verification

After the lock was committed, all 36 development references passed again at
clean evaluator commit `d478145d65fc1bd00c3b1911e927602c18569517`.
The locked gate SHA-256 was
`7be62df4efb0ddeacdc4dbc8c9763bc74f0c5b0a28a13ccc05052bf4d9558800`;
the post-lock calibration report SHA-256 was
`fe424dc1b060c722b978e5eeb33ddb2603010ff6690b4eea1e82b59a193e89e0`.
The holdout remained unexposed.

## Claim boundary

The gates prove a reference-relative visible point-symbol pixel floor and
bound the aggregate share covered by label boxes or actual label pixels at the
locked sample resolution. They do not identify which label belongs to which
point, distinguish beneficial cluster-count placement from all other overlap,
guarantee full-resolution visibility, measure background contrast, or establish
human task accuracy.
