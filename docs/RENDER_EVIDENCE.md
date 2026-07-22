# AtlasBench render evidence

AtlasBench's structural and semantic checks prove that an output parses,
compiles, and preserves the locked map contract. They do not prove that data
actually reached a renderer. Vega can produce a valid but empty SVG when a
relative data URL resolves against the wrong directory, so compile success is
not sufficient render evidence.

The v0.2 render-evidence command closes that first gap for accepted Vega-Lite
conditions:

```powershell
npm run benchmark:v02:render -- `
  --report work/v02-qualification-v2/reports/claude/basic.json `
  --report work/v02-qualification-v2/reports/codex/basic.json `
  --output work/v02-render-evidence
```

The command accepts direct AtlasBench experiment reports and the job-report
wrappers created by the local qualification workflow. It refuses to overwrite
an existing output directory.

## Evidence contract

For each source-accepted `direct-vega-lite` or `atlaspec-vega-lite` run, the
renderer:

1. takes data from the immutable input artifacts preserved with the original
   model request;
2. replaces matching Vega-Lite data URLs with those embedded records;
3. fails if any URL cannot be matched instead of allowing a silent empty map;
4. compiles the hydrated specification with Vega-Lite;
5. executes it with Vega and exports deterministic SVG;
6. checks for a valid positive viewport, mark containers, rendered data marks,
   and accessibility labels;
7. records source-report hashes, source compiler commits, evaluator commit and
   dirty state, SVG hashes, warnings, metrics, and per-run checks.

The evidence bundle contains `render-evidence.json` and one SVG under
`artifacts/` for every successfully rendered run. Source-rejected Vega-Lite
runs remain visible in the summary as `skipped_source_failures`; render health
does not convert a generation failure into a pass.

## Claim boundary

A render-health pass proves only that preserved data produced a non-empty,
accessible SVG through the real Vega-Lite and Vega runtime. It does not prove:

- correct cartographic interpretation;
- acceptable label overlap or symbol occlusion;
- perceptual quality, color contrast, or visual hierarchy;
- equality between MapLibre and Vega-Lite pixels;
- human map-reading accuracy or expert preference.

Those stronger questions require screenshot geometry checks, a browser-backed
MapLibre renderer, and blinded human or cartographer review. Render health is a
prerequisite and an artifact-generation layer for those later evaluations.
