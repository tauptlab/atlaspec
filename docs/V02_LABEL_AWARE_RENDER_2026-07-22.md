# AtlasBench 0.2 label-aware cross-renderer evidence

Date: 2026-07-22

## Verdict

The six frozen post-hardening qualification reports were re-evaluated through
real MapLibre and Vega runtimes after the MapLibre label gates were calibrated
and locked on development compiler references.

- 127 source-accepted runs entered a renderer and 124 passed all renderer and
  visual gates.
- Atlaspec produced 72/72 healthy artifacts across its balanced MapLibre and
  Vega-Lite comparison conditions.
- Direct renderer generation produced 52/72 healthy artifacts: 17 runs had
  already failed source checks, two emitted actionable MapLibre runtime
  warnings, and one additional MapLibre run rendered no labels.
- MapLibre passed 85/88 source-accepted renders; Vega-Lite passed 39/39.
- The label-aware gate therefore changed the earlier geometry-only direct
  result from 53/72 to 52/72, while Atlaspec remained 72/72.
- The v0.2 holdout remained sealed.

Within this development matrix, the observed end-to-end pass-rate difference
was 27.78 percentage points: 100% for Atlaspec versus 72.22% for direct
renderer generation. This is paired development evidence, not an estimate of
performance on unseen tasks or hosted models.

## Results by agent and condition

| Agent and condition | Assigned | Source accepted | Label-aware renderer pass |
|---|---:|---:|---:|
| Claude / Atlaspec to MapLibre | 24 | 24 | **24** |
| Claude / direct MapLibre | 24 | 16 | 15 |
| Claude / Atlaspec to Vega-Lite | 12 | 12 | **12** |
| Claude / direct Vega-Lite | 12 | 7 | 7 |
| Codex / Atlaspec to MapLibre | 24 | 24 | **24** |
| Codex / direct MapLibre | 24 | 24 | 22 |
| Codex / Atlaspec to Vega-Lite | 12 | 12 | **12** |
| Codex / direct Vega-Lite | 12 | 8 | 8 |

The denominator of 72 per approach is the balanced set of MapLibre and
Vega-Lite comparison assignments. Source rejection remains an end-to-end
failure; renderer evidence does not erase it. The 127-render denominator is
used only when reporting health after source acceptance.

## Gate calibration and lock

MapLibre GL JS `5.24.0` generated glyphs locally with
`localIdeographFontFamily: "sans-serif"`; the offline evaluator did not fetch
the style's public glyph endpoint. It measured candidate-backed label coverage,
rendered and duplicate labels, label-only sampled pixels, and label pixels near
the viewport edge.

The 36 development compiler references all passed after the locked gates were
applied. The observed reference floors were:

| Variant | Minimum coverage | Median coverage | Minimum label pixels | Maximum edge ratio |
|---|---:|---:|---:|---:|
| canonical | 50% | 50% | 63 | 0% |
| missing-and-skew | 50% | 50% | 63 | 0% |
| dense-multilingual-mobile | 16.67% | 16.67% | 127 | 0% |
| geographic-capability-boundary | 0% | 16.67% | 1 | 0% |

The zero-coverage geographic reference rendered a cluster-count label instead
of an authored point label. The locked rule permits this fallback only for the
geographic variant. Threshold rationale and the exact rules are recorded in
the [label-gate lock](V02_LABEL_GATE_LOCK_2026-07-22.md).

## Failures retained by the evaluator

Two previously known direct MapLibre failures remained:

- Claude,
  `choropleth-proportional-symbols-adversarial-missing-and-skew`, repetition 1;
- Codex, the same task and repetition.

Both rendered three of six candidate labels and passed the new label gates,
but MapLibre emitted `Expected value to be of type number, but found null
instead.` Their runtime-warning failure was therefore preserved.

The new label-aware failure was Codex direct MapLibre on
`choropleth-categorical-facilities-adversarial-dense-multilingual-mobile`,
repetition 1. The style loaded and rendered its geometry, but rendered zero of
six candidate labels and zero label-only pixels. It failed visible-label,
coverage, pixel, and resolvable edge-ratio checks. The paired Atlaspec output
for the same task rendered one of six candidate labels and 158 label-only
sampled pixels, passing the preregistered dense-variant floor.

## Reproduction check

The complete model-output render was executed twice. Both executions had:

- the same 127 entries and aggregate summary;
- the same three failed run identities and check outcomes;
- the same 127 exported PNG/SVG artifact hashes;
- no pass/fail changes.

Eight MapLibre metric objects differed between executions. Six differed only
in sampled color-bucket or non-background counts. Two label-only measurements
changed by one pixel: 92 to 93 and 61 to 60. These are WebGL readback sampling
differences, not artifact or decision changes, and both measurements remained
far from their locked thresholds. The evidence supports deterministic gate
outcomes on this environment, but it does not claim byte-identical intermediate
pixel metrics across every browser/GPU environment.

The CLI naturally exited with status 1 after writing the complete second
bundle because three checks failed. That non-zero status is expected benchmark
behavior, not an interrupted run.

## Provenance

- Clean evaluator commit:
  `312f74ef4be745f9e24b39e17e9d70bd7aef4d7b`.
- Evaluator dirty state: `false`.
- Frozen source compiler commit:
  `587f6e475c95b07a264d7bca2a8281b6278bf35c`.
- Locked gate ID: `atlasbench-v02-maplibre-label-gates-v1`.
- Locked gate SHA-256:
  `8d0cf7916084888aafe7f60a9f98006b1305cbdcf6de220ccc61a1fe6330b081`.
- Post-lock calibration report:
  `work/v02-label-calibration-v2/calibration.json`.
- Calibration report SHA-256:
  `c196793d286990fca9d7cd51900258edc339102df8a88d662d88eb7a33e6d80e`.
- Final evidence report:
  `work/v02-render-evidence-v4/render-evidence.json`.
- Final evidence report SHA-256:
  `520c2979e8fb90527f0a0d923ac289d293fdf8c8ab0593d889055b8ecb2f2b41`.
- Browser: Google Chrome `150.0.7871.115`, headless through
  `playwright-core@1.61.1`.
- Holdout state: not exposed.

The `work/` bundles are local immutable evidence and are not committed because
they include large generated artifacts. Their hashes and generation contracts
make the exact local evidence auditable.

## Claim boundary and next evidence

This run establishes that Atlaspec's accepted outputs reached real renderers,
retained visible geometry, rendered locally generated text above locked
variant-specific floors, avoided duplicate queried labels and sampled edge
clipping, and produced no actionable runtime warnings.

It does not establish that every visible label is the right label, that the
font is readable to a human, that labels avoid all symbols and other text, or
that the map supports real analysis tasks. In particular, manual inspection of
the dense Atlaspec image confirms visible text but is not enough to certify
semantic priority or overlap quality.

The next internally solvable evidence layer should therefore preregister:

- label-to-label and label-to-symbol overlap from rendered bounding geometry;
- minimum effective font size and contrast;
- semantic-priority retention when collision handling suppresses labels;
- paired task-answer accuracy on generated maps, followed by blind human and
  cartographer review.

