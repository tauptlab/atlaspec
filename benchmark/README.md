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

The comparative harness supports direct MapLibre authoring, direct Vega-Lite
authoring, Atlaspec generation, and Atlaspec repair. Provider adapters must
record the full prompt, model identifier, sampling parameters, token use,
latency, price, tool calls, and every failed output. The smoke suite does not
invent zero values for metrics it has not measured.

Pilot fixtures are development-visible and are not counted as holdout. The
frozen 48-task development/holdout matrix and its integrity rules live in
`corpus/`.

## Comparative runner

The provider-neutral comparison runner is now executable. Start from
`comparison.example.json`, implement the JSON standard-stream contract in
`ADAPTER.md`, and run:

```powershell
npm run atlasbench -- `
  --manifest benchmark/comparison.example.json `
  --adapter node `
  --adapter-arg=path/to/provider-adapter.mjs `
  --report work/comparison-report.json
```

The report includes every prompt, input and prompt digest, raw response,
transport failure, validation check, token count, charge, latency, tool call,
repair attempt, condition aggregate, and paired automated analysis. Use
`--require-automated-pass` only when a failing or insufficient automated gate
should fail a CI job.

An automated pass is intentionally labeled separately from the full benchmark.
It does not satisfy the human accuracy, expert review, edit-survival, repair-
count, held-out corpus, or multi-model-stratum requirements.
