# AtlasBench 0.2 placed-label geometry evidence

Date: 2026-07-23

## Verdict

The preregistered placed-label geometry gates were applied to the same six
frozen post-hardening Claude and Codex reports used by the earlier label-aware
evaluation.

- MapLibre placement geometry was recoverable for 88/88 source-accepted
  MapLibre outputs.
- All 48 Atlaspec-to-MapLibre outputs had at least one placed label box,
  zero overlapping pairs, zero forced-overlap boxes, and zero viewport
  clipping.
- Of 40 direct MapLibre outputs, 39 had at least one placed label box with the
  same zero-overlap, zero-forced-overlap, and zero-clipping result.
- The remaining direct output was the already identified dense multilingual
  run that rendered zero labels.
- No new output changed pass/fail status: Atlaspec remained 72/72 and direct
  generation remained 52/72 across the balanced MapLibre and Vega-Lite
  comparison assignments.
- The v0.2 holdout remained sealed.

This is a useful positive result about placement hygiene, but it does not add a
new performance separation. The measured advantage remains the earlier
end-to-end 27.78 percentage-point development difference caused by source
failures, two runtime-warning failures, and one zero-label failure—not by
overlapping or clipped labels.

## Placement results

| Condition | MapLibre runs | Runs with placed boxes | Minimum box height | Median minimum height | Maximum clipping | Overlapping pairs | Forced-overlap boxes |
|---|---:|---:|---:|---:|---:|---:|---:|
| Atlaspec to MapLibre | 48 | **48** | 18.375 px | 18.375 px | 0% | 0 | 0 |
| Direct MapLibre | 40 | 39 | 17.1875 px | 18.375 px | 0% | 0 | 0 |

The maximum minimum-box height was 47.1875 px in both conditions, occurring in
dense multilingual layouts. Collision-box height includes layout padding and
can span multiple lines, so it is not a direct font-size measurement.

The 12 px locked floor left a 5.1875 px margin under the smallest visible
direct label box and a 6.375 px margin under the smallest Atlaspec box. The
clipping, overlap, and forced-placement gates were exact at their observed
zero reference maxima, except for the preregistered 2% viewport-clipping
tolerance.

## Existing failures retained

The complete renderer result remained 124/127 after source acceptance:

- two direct MapLibre outputs still failed only because MapLibre emitted the
  actionable numeric-`null` runtime warning;
- one Codex direct MapLibre dense multilingual output still failed because it
  rendered zero of six candidate labels and therefore had no label box height
  or clipping ratio to evaluate;
- Vega-Lite remained 39/39 renderer-healthy;
- MapLibre remained 85/88 renderer-healthy.

The two runtime-warning failures both passed every placement gate. Their
smallest placed boxes were 17.1875 px and 18.375 px respectively, with no
overlap or clipping. The zero-label run additionally failed the new box-height
and box-clipping checks as unresolved, but it was already a label-aware
failure. Thresholds were not changed after observing these outcomes.

## Reproduction relation to the prior run

Compared with `work/v02-render-evidence-v4/render-evidence.json`, the new
report had:

- the same 127 rendered entries;
- the same three failed run identities;
- zero pass/fail changes;
- zero PNG/SVG artifact-hash changes.

The new report adds placement geometry and locked checks without altering the
rendered visual artifacts.

## Provenance

- Clean evaluator commit:
  `d2c3d8a800ebc4740f6d4690640318d016c0ed7e`.
- Evaluator dirty state: `false`.
- Frozen source compiler commit:
  `587f6e475c95b07a264d7bca2a8281b6278bf35c`.
- Existing label-gate SHA-256:
  `8d0cf7916084888aafe7f60a9f98006b1305cbdcf6de220ccc61a1fe6330b081`.
- Placement-geometry gate SHA-256:
  `81943dc81c3c33c8fbe70ed3877724057bc000c7bae31a3c19f8e60263b1ab47`.
- Post-lock calibration report:
  `work/v02-placement-calibration-v2/calibration.json`.
- Post-lock calibration SHA-256:
  `ffb967cc20756111430364eed257f29d115e8b1d1b68e074a709a129b5cc96ab`.
- Final evidence report:
  `work/v02-placement-render-evidence-v5/render-evidence.json`.
- Final evidence SHA-256:
  `e895d05696ae8084c5eb3e3b077b219f8464fbc72b8e3b356aa83c90b8f14454`.
- Browser: Google Chrome `150.0.7871.115`, headless through
  `playwright-core@1.61.1`.
- Holdout state: not exposed.

The final CLI exited with status 1 after writing the complete bundle because
the same three failures remained. This is expected benchmark behavior.

## Claim boundary and next evidence

This run shows that MapLibre's actual placed collision boxes can be audited and
that every visible-label output in the frozen development reports avoided
box-to-box overlap, forced placement, and viewport clipping while clearing a
reference-relative minimum height.

It does not show whether text contrasts with its local background, whether a
label box covers an important point symbol, whether collision handling kept
the most important label, or whether a human can answer map-reading questions
accurately. Because the new gate did not further separate Atlaspec from direct
generation, those dimensions are the next useful internal R&D targets rather
than tightening this gate after seeing the result.

