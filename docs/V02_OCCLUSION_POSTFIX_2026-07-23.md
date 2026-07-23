# AtlasBench 0.2 proportional-label post-fix evidence

Date: 2026-07-23

## Verdict

The v0.2 MapLibre compiler now gives proportional-symbol labels a 3 em
maximum-radius clearance. Frozen v0.1 compiler outputs remain unchanged.

Against the same six preserved Claude and Codex development reports and the
same locked renderer gates:

- the 36 compiler-reference calibration tasks passed 36/36;
- Atlaspec recovered from 68/72 to **72/72** healthy comparison outputs;
- direct renderer generation remained **40/72**;
- the source-accepted renderer total increased from 108/127 to **112/127**;
- MapLibre increased from 69/88 to **73/88**, while Vega-Lite remained 39/39;
- the four targeted Atlaspec failures all passed and no new Atlaspec failure
  appeared.

The resulting 44.44 percentage-point Atlaspec/direct difference is a
post-selected engineering result, not a fresh benchmark estimate. The locked
pre-fix result remains the unbiased historical development verdict:
68/72 versus 40/72, a 38.89 percentage-point difference.

## Intervention

The compiler applies the new policy only on the v0.2 proportional-symbol path:

- authored `capacity` ranges are preserved;
- label offset is fixed at `[0, 3]` em;
- the decision trace records `label.proportional-clearance`, the 28 px maximum
  radius, and the 12 px text size;
- v0.1 continues to use its historical `[0, 1.2]` offset and all frozen v0.1
  result hashes still pass.

The fixed clearance is deliberately based on the maximum compiled radius.
The first implementation scaled offset by each feature's own radius and
recovered only one of four failures:

| Compiler state | Atlaspec MapLibre | Atlaspec all renderers | All source-accepted |
|---|---:|---:|---:|
| locked pre-fix | 44/48 | 68/72 | 108/127 |
| own-feature adaptive offset | 45/48 | 69/72 | 109/127 |
| maximum-radius clearance | **48/48** | **72/72** | **112/127** |

The intermediate result showed that a small feature's label can overlap a
neighboring large symbol. It motivated the cross-feature-safe policy rather
than being discarded as an inconvenient run.

## Final results by agent and condition

| Agent and condition | Assigned | Source accepted | Final pass |
|---|---:|---:|---:|
| Claude / Atlaspec to MapLibre | 24 | 24 | **24** |
| Claude / direct MapLibre | 24 | 16 | 10 |
| Claude / Atlaspec to Vega-Lite | 12 | 12 | **12** |
| Claude / direct Vega-Lite | 12 | 7 | 7 |
| Codex / Atlaspec to MapLibre | 24 | 24 | **24** |
| Codex / direct MapLibre | 24 | 24 | 15 |
| Codex / Atlaspec to Vega-Lite | 12 | 12 | **12** |
| Codex / direct Vega-Lite | 12 | 8 | 8 |

The 17 source-rejected direct runs remain end-to-end failures. They are skipped
by the renderer rather than converted into passes.

## Provenance

Final compiler and renderer evidence:

- Clean evaluator commit:
  `68e27cc5c2b3214cb666c755dd0ae5db1edfbc7b`.
- Evaluator dirty state: `false`.
- Post-fix calibration:
  `work/v02-occlusion-postfix-calibration-v2/calibration.json`.
- Calibration SHA-256:
  `42ff8cfff5f001f9bed7770b091b666773f5a25df30ed2e9ab79050d190db50b`.
- Model-output evidence:
  `work/v02-occlusion-postfix-evidence-v2/render-evidence.json`.
- Evidence SHA-256:
  `23038c049389431b7ffd2c1b5c56636a1e3a250c970afce1d00db822d154d807`.
- Occlusion-gate SHA-256:
  `7be62df4efb0ddeacdc4dbc8c9763bc74f0c5b0a28a13ccc05052bf4d9558800`.
- Browser: Google Chrome `150.0.7871.115`, headless through
  `playwright-core@1.61.1`.
- Calibration split: development.
- Holdout exposed: `false`.

The failed intermediate compiler evidence is preserved at clean commit
`057d9cbbe315c3f98a1a82c3febf158c2efccafe`:

- report:
  `work/v02-occlusion-postfix-evidence-v1/render-evidence.json`;
- SHA-256:
  `6533629dff1c41654849e6f0185030de2c7693e06d11c4cad1dd1e8445090711`.

The final model-output command exited with status 1 after writing its complete
bundle because 15 direct MapLibre outputs still failed locked checks. This is
expected benchmark behavior.

## Claim boundary

The result demonstrates that the chosen compiler change repairs all four
observed Atlaspec failures without a detected regression in these preserved
development outputs. It does not independently estimate generalization because
the task, failures, and intervention were selected after observing the locked
result.

The v0.2 holdout remains sealed. A confirmatory claim still requires a
precommitted evaluation on unseen tasks, and visual correctness still requires
local-background contrast, semantic label-priority, human map-reading, and
blind cartographer evidence.
