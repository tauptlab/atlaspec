# AtlasBench harness

This directory turns the evaluation contract in `docs/BENCHMARK.md` into
executable checks. The current pilot suite is a compiler smoke benchmark, not a
claim that the full 48-task model comparison has been completed.

The pilot verifies that every supported map family:

- passes Atlaspec schema and cartographic linting;
- compiles without model-dependent repair;
- produces an official MapLibre-valid style;
- contains its required renderer layer types;
- records the required semantic decisions;
- produces no unexpected diagnostics.

Run it with:

```powershell
npm run benchmark:smoke
```

The JSON report includes the source commit, Node version, suite manifest,
per-check results, accepted count, and Reliable Map Yield. A non-passing task
causes a non-zero process exit.

## Full benchmark boundary

The complete benchmark will add adapters for direct MapLibre authoring, direct
Vega-Lite authoring, Atlaspec generation, and Atlaspec repair. Model adapters
must record the full prompt, model identifier, sampling parameters, token use,
latency, price, tool calls, and every failed output. The smoke suite does not
invent zero values for metrics it has not measured.

Pilot fixtures are development-visible and therefore cannot be counted as the
held-out portion of the eventual benchmark.
