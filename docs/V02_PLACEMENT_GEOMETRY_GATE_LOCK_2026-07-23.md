# AtlasBench 0.2 placed-label geometry gate lock

Date: 2026-07-23

## Status

The thresholds in `benchmark/v02/placement-gates-v1.json` are locked before
applying them to preserved model outputs. Calibration used only the 36
development compiler references. The 12-task holdout was not rendered or
exposed.

Calibration provenance:

- clean evaluator commit:
  `675a687174c601942ccc2a048de3e51e1d6b0557`;
- calibration report:
  `work/v02-legibility-calibration-v1/calibration.json`;
- calibration report SHA-256:
  `8854220e390b4462c0c7ac93a4e9008737ceffd40bd23f6087356c16ec4f0995`;
- development reference tasks: 36/36 basic and label-gate pass;
- recorded holdout state: `holdout_exposed: false`.

## Reference observations

| Variant | Minimum box height | Maximum clipping | Maximum overlapping pairs | Maximum forced-overlap boxes |
|---|---:|---:|---:|---:|
| canonical | 18.375 px | 0% | 0 | 0 |
| missing-and-skew | 18.375 px | 0% | 0 | 0 |
| dense-multilingual-mobile | 47.1875 px | 0% | 0 | 0 |
| geographic-capability-boundary | 18.375 px | 0% | 0 | 0 |

Every rendered reference label was matched by a visible placement collision
box. The dense multilingual box is taller because the placed layout spans
multiple text lines; its height must not be interpreted as a measured font
size.

## Locked rules

A MapLibre result must satisfy all of the following after the existing label
coverage and pixel gates:

- placement geometry is available through the version-scoped MapLibre v5
  collision-index method;
- minimum visible label collision-box height is at least 12 px;
- no more than 2% of any placed box is clipped by the viewport;
- zero overlapping placed-label box pairs;
- maximum pairwise overlap ratio is zero;
- zero boxes use `text-allow-overlap: true` or
  `text-ignore-placement: true` placement.

The 12 px floor retains roughly 65% of the 18.375 px non-dense reference
minimum. It detects extreme shrinkage without treating collision-box height as
font size. The 2% clipping allowance covers minor floating-point or browser
edge variation; all references observed 0%. Overlap and forced-placement
thresholds stay at the reference maximum of zero.

These rules are fixed before inspecting preserved model-output placement
metrics and must not be relaxed after reclassification.

## Post-lock verification

After the lock was committed, all 36 development references passed again at
clean evaluator commit `d2c3d8a800ebc4740f6d4690640318d016c0ed7e`.
The locked gate SHA-256 was
`81943dc81c3c33c8fbe70ed3877724057bc000c7bae31a3c19f8e60263b1ab47`;
the post-lock calibration report SHA-256 was
`ffb967cc20756111430364eed257f29d115e8b1d1b68e074a709a129b5cc96ab`.
The holdout remained unexposed.

## Method and claim boundary

MapLibre's public query API exposes rendered features but not their final
screen-space bounds. The evaluator therefore reads the placement collision
index used by pinned MapLibre v5, subtracts its 100 px viewport padding, removes
fully off-screen boxes, and evaluates the remaining rectangles. It fails
closed if that private structure changes or cannot account for rendered text.

The gates prove recoverable placed bounds, reference-relative box size, bounded
viewport clipping, and absence of placed-box overlap or forced overlap. They do
not measure glyph contrast, exact font size, label-to-symbol occlusion,
semantic importance, or human task accuracy.
