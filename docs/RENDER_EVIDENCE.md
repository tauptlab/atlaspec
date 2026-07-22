# AtlasBench render evidence

AtlasBench's structural and semantic checks prove that an output parses,
compiles, and preserves the locked map contract. They do not prove that data
actually reached a renderer. Vega can produce a valid but empty SVG when a
relative data URL resolves against the wrong directory, and MapLibre can emit
data-expression warnings only after a style reaches a browser. Compile success
is therefore not sufficient render evidence.

The v0.2 render-evidence command closes that first gap for accepted MapLibre
and Vega-Lite conditions:

```powershell
npm run benchmark:v02:render -- `
  --report work/v02-qualification-v2/reports/claude/basic.json `
  --report work/v02-qualification-v2/reports/codex/basic.json `
  --output work/v02-render-evidence
```

Use `--browser <file>` or `ATLASBENCH_BROWSER` to select Chrome/Chromium
explicitly. Otherwise the command checks deterministic system locations. It
uses `playwright-core`; it does not download a browser.

The command accepts direct AtlasBench experiment reports and the job-report
wrappers created by the local qualification workflow. It refuses to overwrite
an existing output directory.

## Evidence contract

For each source-accepted `direct-maplibre`, `atlaspec-maplibre`,
`direct-vega-lite`, or `atlaspec-vega-lite` run, the renderer:

1. takes data from the immutable input artifacts preserved with the original
   model request;
2. replaces matching Vega-Lite data URLs with those embedded records;
3. fails if any URL cannot be matched instead of allowing a silent empty map;
4. executes MapLibre in an offline headless Chrome/Chromium context or compiles
   and executes Vega-Lite with Vega;
5. exports PNG for MapLibre and deterministic SVG for Vega-Lite;
6. checks MapLibre source loading, rendered feature counts, non-background
   pixels, runtime errors, and actionable console warnings, or checks Vega
   viewport, mark containers, rendered data marks, and accessibility labels;
7. records source-report hashes, source compiler commits, evaluator commit and
   dirty state, SVG hashes, warnings, metrics, and per-run checks.

The evidence bundle contains `render-evidence.json` and one PNG or SVG under
`artifacts/` for every executed render. Source-rejected runs remain visible in
the summary as `skipped_source_failures`; render health does not convert a
generation failure into a pass. Known SwiftShader readback-performance noise
is retained but excluded from the warning gate. Data-expression warnings such
as a numeric expression receiving `null` remain actionable failures.

MapLibre runs remove symbol layers and their external glyph URL before entering
the offline browser. The PNG evidence therefore covers geometry layers only:
fill, circle, heatmap, and other non-symbol layers. Every suppressed layer ID is
recorded per artifact. This avoids turning a network-dependent public font
service into benchmark evidence while keeping the missing label-rendering gate
explicit.

## Claim boundary

A render-health pass proves only that preserved data produced visible geometry
through the real MapLibre or Vega runtime. It does not prove:

- correct cartographic interpretation;
- acceptable label overlap or symbol occlusion;
- perceptual quality, color contrast, or visual hierarchy;
- equality between MapLibre and Vega-Lite pixels;
- human map-reading accuracy or expert preference.

Those stronger questions require local glyph fixtures, label/symbol geometry
checks, calibrated screenshot thresholds, and blinded human or cartographer
review. Render health is a prerequisite and an artifact-generation layer for
those later evaluations.
