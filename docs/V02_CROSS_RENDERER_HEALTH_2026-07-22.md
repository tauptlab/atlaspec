# AtlasBench 0.2 cross-renderer health evidence

Date: 2026-07-22

## Verdict

The six frozen post-hardening qualification reports were re-evaluated through
real MapLibre and Vega runtimes at clean evaluator commit
`dce1f8688260b3344371ce4b2e606a813d029262`.

- 144 of the 216 experiment runs used one of the four balanced render
  conditions covered here.
- 127 passed the existing source-generation evaluator and entered a renderer.
- 125/127 passed renderer health.
- Vega-Lite produced 39/39 healthy SVGs.
- MapLibre produced 88 PNGs, of which 86 passed and 2 retained actionable
  runtime data warnings.
- The 17 earlier source failures remained skipped source failures; they were
  not erased or reclassified.
- The v0.2 holdout remained sealed.

This is stronger than compiler validation alone, but it is still a development
qualification result and not a complete visual-quality verdict.

## Results by agent and condition

| Agent and condition | Assigned | Source accepted | Renderer-health pass |
|---|---:|---:|---:|
| Claude / Atlaspec to MapLibre | 24 | 24 | **24** |
| Claude / direct MapLibre | 24 | 16 | 15 |
| Claude / Atlaspec to Vega-Lite | 12 | 12 | **12** |
| Claude / direct Vega-Lite | 12 | 7 | 7 |
| Codex / Atlaspec to MapLibre | 24 | 24 | **24** |
| Codex / direct MapLibre | 24 | 24 | 23 |
| Codex / Atlaspec to Vega-Lite | 12 | 12 | **12** |
| Codex / direct Vega-Lite | 12 | 8 | 8 |

Across the four non-repair comparison conditions, Atlaspec therefore produced
72/72 source-accepted, renderer-healthy artifacts. Direct renderer generation
produced 55/72 source-accepted artifacts and 53/72 renderer-healthy artifacts.
These counts are paired development evidence, not a holdout estimate or a
claim that every visual choice is correct.

## New runtime failures

Both renderer-health failures occurred on repetition 1 of
`choropleth-proportional-symbols-adversarial-missing-and-skew` under direct
MapLibre generation, once for each local agent. Both styles:

- passed the existing style and semantic checks;
- loaded both GeoJSON sources;
- rendered 12 queried features;
- produced a non-empty PNG;
- emitted `Expected value to be of type number, but found null instead.` from
  MapLibre at runtime.

The PNG alone would have looked like success. Treating the runtime warning as a
failure demonstrates why browser execution belongs in the benchmark. The
Atlaspec-to-MapLibre outputs for the same condition did not emit that warning.

Known SwiftShader readback-performance warnings are retained in artifact
metadata but excluded from the correctness gate. Data-expression and other
browser warnings remain actionable.

## MapLibre geometry observations

- Browser: Google Chrome `150.0.7871.115`, headless through
  `playwright-core@1.61.1`.
- Renderer: `maplibre-gl@5.24.0`.
- MapLibre PNG artifacts: 88.
- Rendered queried features per PNG: 10 to 30, mean 16.36.
- Non-background pixel ratio: 0.164% to 26.73%, mean 15.95%.
- PNG size: 3,681 to 86,616 bytes.
- All GeoJSON was injected from preserved request artifacts in an offline
  browser context.
- Antimeridian bounds use the shortest wrapped longitude extent instead of a
  nearly global naive bounding box.

Manual inspection confirmed an important distinction. Canonical views show
large visible polygons and point symbols, while the lowest-occupancy
high-latitude/antimeridian operational view contains only small, widely
separated features on a mostly empty canvas. It passes render health because
the data is present, but it should not automatically pass a future readability
gate.

MapLibre symbol layers are excluded from this run because the current compiled
styles reference a public glyph endpoint and the renderer deliberately runs
offline. Suppressed symbol-layer IDs are recorded in every MapLibre entry.
Consequently, these PNGs validate fill, circle, heatmap, source, viewport, and
pixel behavior—not final label quality.

## Provenance

- Clean render-evaluator commit:
  `dce1f8688260b3344371ce4b2e606a813d029262`.
- Evaluator dirty state: `false`.
- Frozen source compiler commit:
  `587f6e475c95b07a264d7bca2a8281b6278bf35c`.
- Evidence report:
  `work/v02-render-evidence-v2/render-evidence.json`.
- Evidence report SHA-256:
  `f4e27f4a3a04a716772b3e83840e25a0bf8936105ddc896e63151a46ed4613e8`.
- Artifacts: 88 MapLibre PNG files and 39 Vega-Lite SVG files.

The command intentionally returned a non-zero exit status after writing the
complete immutable bundle because two renderer checks failed.

## Claim boundary and next gate

This run proves real renderer execution, input loading, visible geometry,
actionable-warning detection, and immutable screenshot/SVG production. It does
not prove label quality, legend availability in MapLibre, non-overlap,
perceptual hierarchy, color contrast, or human task accuracy.

The next internal R&D gate should be preregistered before inspecting more
outputs and should measure at least:

- minimum viewport occupancy by task/variant rather than one universal cutoff;
- projected feature-size and separation distributions;
- symbol occlusion and off-screen clipping;
- local-glyph label bounding boxes, collision, and duplicate suppression;
- paired direct-versus-Atlaspec geometry differences for the same task.

Human and cartographer review remains an external validation layer after those
deterministic metrics are calibrated.
