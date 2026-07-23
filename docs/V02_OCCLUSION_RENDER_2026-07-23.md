# AtlasBench 0.2 label-to-point-symbol occlusion evidence

Date: 2026-07-23

## Verdict

The preregistered point-symbol visibility and label-occlusion gates were
applied to the same six frozen post-hardening Claude and Codex reports used by
the earlier renderer evaluations.

- 127 source-accepted runs entered a renderer and 108 passed all accumulated
  gates.
- Atlaspec produced 68/72 healthy artifacts across the balanced MapLibre and
  Vega-Lite comparison assignments.
- Direct renderer generation produced 40/72 healthy artifacts.
- The observed development pass rates were therefore 94.44% and 55.56%, a
  38.89 percentage-point difference.
- MapLibre passed 69/88 source-accepted renders; Vega-Lite remained 39/39.
- The v0.2 holdout remained sealed.

The previous placement-only result was 72/72 for Atlaspec and 52/72 for direct
generation. The new gate exposed 16 additional failures: four Atlaspec
MapLibre outputs and twelve direct MapLibre outputs. The two existing
numeric-`null` runtime failures and one zero-label failure remained, bringing
the total MapLibre failure count to 19.

This is development qualification evidence. The repeated runs, tasks, and two
local agents are correlated, and the thresholds were calibrated on compiler
references rather than an external cartographic gold standard.

## Results by agent and condition

| Agent and condition | Assigned | Source accepted | Final pass |
|---|---:|---:|---:|
| Claude / Atlaspec to MapLibre | 24 | 24 | **22** |
| Claude / direct MapLibre | 24 | 16 | 10 |
| Claude / Atlaspec to Vega-Lite | 12 | 12 | **12** |
| Claude / direct Vega-Lite | 12 | 7 | 7 |
| Codex / Atlaspec to MapLibre | 24 | 24 | **22** |
| Codex / direct MapLibre | 24 | 24 | 15 |
| Codex / Atlaspec to Vega-Lite | 12 | 12 | **12** |
| Codex / direct Vega-Lite | 12 | 8 | 8 |

Across MapLibre only, Atlaspec passed 44/48 and direct generation passed 25/40
source-accepted outputs. The source-rejected direct runs remain end-to-end
failures and are not converted into renderer passes.

## Occlusion measurements

| Condition | MapLibre runs | Minimum point pixels | Maximum box coverage | Maximum glyph coverage |
|---|---:|---:|---:|---:|
| Atlaspec to MapLibre | 48 | 10 | 19.61% | 10.46% |
| Direct MapLibre | 40 | 13 | 24.39% | 12.20% |

`box coverage` is the share of isolated point-symbol pixels located inside any
placed label collision box. `glyph coverage` is the share also changed by
actual label pixels. Both are aggregate quarter-resolution measures.

The sixteen newly failed outputs consisted of:

- four Atlaspec outputs, all two repetitions from both agents for
  `choropleth-proportional-symbols-basic-geographic-capability-boundary`;
- five Claude direct outputs across categorical facilities, proportional
  symbols, and operational overview;
- seven Codex direct outputs across categorical facilities, proportional
  symbols, dense heatmap reference points, and operational overview.

Manual inspection agreed with the measurements. The Atlaspec geographic output
places the `points 1` text across the lower part of a large proportional
circle. The most severe direct heatmap output places multiple multilingual
labels across a dense stack of reference-point circles.

## Atlaspec failure analysis

All four Atlaspec failures share a narrower declared `capacity` range than the
development compiler reference:

- three declare `[12, 900]`;
- one declares `[0, 1000]`;
- the compiler reference declares `[0, 10000]`.

The MapLibre compiler uses the declared field range as the proportional-symbol
domain. A narrower upper bound makes the largest data value approach the
maximum 28 px radius, while the label offset remains fixed. This is a concrete
compiler-hardening hypothesis supported by the shared inputs, compiled
behavior, and screenshot, but a controlled range/offset ablation is still
required before calling it the sole cause.

The result is important for the claim boundary: Atlaspec substantially
outperformed direct generation, but it did not automatically guarantee safe
label-to-symbol placement. Semantic metadata supplied by an agent can still
drive a poor compiled visual choice.

## Threshold sensitivity

Fourteen of the sixteen new failures exceeded at least one locked ceiling by
more than 0.5 percentage points. Two Codex direct failures were close to the
boundary:

- box coverage 10.0218% against a 10% ceiling;
- glyph coverage 3.1579% against a 3% ceiling.

They remain failures because the gates were locked before reclassification.
They should be treated as boundary-sensitive cases rather than strong visual
defects.

## Reproduction

The complete 127-render evaluation was executed twice after the lock:

- both runs produced 108 passes and the same 19 failed identities;
- there were zero pass/fail changes;
- all 127 exported PNG/SVG hashes were unchanged;
- one passing direct MapLibre run changed by one sampled glyph-overlap pixel,
  from zero to one, while remaining below its gate.

The repeated final evidence report is used below. The stable decisions support
the locked-environment verdict, while the one-pixel difference confirms that
threshold margins should remain explicit.

## Provenance

- Clean evaluator commit:
  `d478145d65fc1bd00c3b1911e927602c18569517`.
- Evaluator dirty state: `false`.
- Frozen source compiler commit:
  `587f6e475c95b07a264d7bca2a8281b6278bf35c`.
- Occlusion-gate SHA-256:
  `7be62df4efb0ddeacdc4dbc8c9763bc74f0c5b0a28a13ccc05052bf4d9558800`.
- Post-lock calibration report:
  `work/v02-occlusion-calibration-v2/calibration.json`.
- Post-lock calibration SHA-256:
  `fe424dc1b060c722b978e5eeb33ddb2603010ff6690b4eea1e82b59a193e89e0`.
- First model-output evidence SHA-256:
  `90915269dff7abf1bf911e8aac4c2334f9341e6b0e2ad42a6c08d75eff1369e0`.
- Repeated final evidence report:
  `work/v02-occlusion-render-evidence-v7/render-evidence.json`.
- Repeated final evidence SHA-256:
  `6d69ab115f6b561836a2aa3bf19f2b3fe44a863bec4212552562d4772f073093`.
- Browser: Google Chrome `150.0.7871.115`, headless through
  `playwright-core@1.61.1`.
- Holdout state: not exposed.

Both model-output commands exited with status 1 after writing complete bundles
because locked checks failed. This is expected benchmark behavior.

## Claim boundary and next work

This result demonstrates that layer-isolated renderer pixels can expose
label-to-point-symbol occlusion missed by parsing, compilation, non-empty
screenshots, label coverage, and collision-box overlap checks. It also shows a
larger development advantage for Atlaspec while retaining four real Atlaspec
failures.

It does not prove which semantic label-symbol pair caused every aggregate
overlap, full-resolution legibility, background contrast, correct label
priority, or human task accuracy.

The next internally useful work is:

- a controlled proportional-symbol range and label-offset ablation for the
  four Atlaspec failures;
- compiler hardening that ties label clearance to maximum rendered radius or
  validates declared ranges against data;
- pixel-level local-background contrast measurement;
- semantic-priority retention, followed by blinded human review.

