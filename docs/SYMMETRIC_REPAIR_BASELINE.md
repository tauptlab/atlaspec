# Symmetric validator-and-repair baseline

Atlaspec's current public evidence does **not** establish that it beats a direct
renderer workflow equipped with deterministic validation and retry. This R&D
protocol exists to measure that stronger practical baseline without changing
the frozen v0.2 manifests or retroactively changing published results.

A six-task development
[pilot](V02_SYMMETRIC_REPAIR_PILOT_2026-07-27.md) has exercised this protocol.
It is exploratory and does not replace the adequately powered, precommitted
experiment described below.

## Conditions

The runner supports four opt-in conditions:

| Renderer | Direct renderer | Atlaspec |
| --- | --- | --- |
| MapLibre | `direct-maplibre-repair` | `atlaspec-maplibre-repair` |
| Vega-Lite | `direct-vega-lite-repair` | `atlaspec-vega-lite-repair` |

Each condition receives the same task and input data. Its first output is
evaluated with the same deterministic checks used by the existing v0.2 runner.
When the output fails, the agent receives only those failed diagnostics, the
previous output, and an instruction to return a complete replacement. Both
sides receive at most one repair. Transport failures are not retried.

The original manifests remain byte-for-byte unchanged. Repair variants are
available only when explicitly selected, and their run IDs should include a
distinct `--run-variant`.

## Run a paired slice

Use the same provider, resolved model identity, tasks, repetitions, sampling,
and output-token ceiling for every condition. For example:

```powershell
npm run benchmark:v02:run -- `
  --manifest benchmark/v02/development.manifest.json `
  --output work/symmetric-repair-codex.json `
  --provider codex-cli `
  --model <model-selector> `
  --version <resolved-version> `
  --condition direct-maplibre-repair `
  --condition atlaspec-maplibre-repair `
  --condition direct-vega-lite-repair `
  --condition atlaspec-vega-lite-repair `
  --run-variant symmetric-repair-rnd
```

Capability-negative tasks do not declare Vega-Lite conditions, so the runner
automatically excludes their Vega-Lite repair variants. A request selecting
only unavailable conditions fails instead of silently changing the comparison.

Analyze a completed report with:

```powershell
npm run benchmark:v02:rnd:analyze-repair -- `
  --report work/symmetric-repair-codex.json `
  --output work/symmetric-repair-codex.analysis.json
```

The analysis pairs by task and repetition and reports first-attempt yield,
post-repair yield, repair rate, output tokens per run, the paired final-yield
delta, a deterministic paired-bootstrap 95% interval, latency, and observed
provider charge when the CLI exposes it.

## Interpretation rules

- Treat the result as an R&D diagnostic until the protocol is frozen and run on
  a sealed holdout.
- Compare token counts only within the same agent and resolved model identity.
- Report the number of paired runs and interval beside every point estimate.
- Do not combine MapLibre and Vega-Lite into one headline without also
  publishing renderer-specific results.
- Do not use the existing 68/72 versus 40/72 renderer-health result as a
  substitute for this experiment.
