# Official AtlasBench generation runbook

This runbook covers the official **generation stage** over the frozen
development corpus. It preserves rejected outputs and renderer-depth validation
evidence. It does not by itself complete the human, expert, screenshot-quality,
edit-survival, or cross-model statistical gates in `BENCHMARK.md`.

## Locked scale

The development stage has 36 tasks, five repetitions, and three required model
strata. Vega-Lite is not declared for heatmaps, so the prepared three-model
bundle contains:

- 108 independently restartable model-by-task jobs;
- 2,025 required first-attempt condition runs;
- up to 540 additional Atlaspec repair calls;
- 2,565 maximum generation calls.

The later 12-task holdout stage adds 675 required runs and up to 180 repairs
across three models. The complete generation matrix is therefore 2,700 required
runs and at most 3,420 model calls. Holdout preparation is intentionally not
implemented by the official command yet; it must remain unexposed until the
development evaluation and deterministic checks are frozen.

## Model plan requirements

Copy `benchmark/official.plan.example.json` into ignored `work/` and replace all
placeholders. The plan fails closed unless it contains at least one model in
each stratum:

- `small-or-local`;
- `mid-tier-hosted`;
- `frontier-hosted`.

Every entry must use a raw model API, an immutable provider-resolved version,
observable monetary cost, and a dated or immutable pricing source. Local Codex
and Claude coding-agent wrappers are useful development probes but are rejected
from this official plan because they inject agent-specific context; Codex CLI
also does not report its resolved model or charge.

## Prepare the development bundle

```powershell
npm run corpus:check

npm run benchmark:official:prepare -- `
  --plan work/official.models.json `
  --output work/official-development
```

Preparation refuses a nonempty output directory. The generated
`official-plan.json` pins the compiler commit, dependency lock digest, source
manifest digest, each shard digest, model strata, expected run counts, output
paths, and the unevaluated claim gates.

## Run one shard

The checked-in OpenAI Responses adapter can be used only after setting the API
key and the locked price card values documented in `benchmark/ADAPTER.md`.

```powershell
npm run benchmark:official:run-job -- `
  --bundle work/official-development `
  --job '<model-id>/<task-id>' `
  --adapter node `
  --adapter-arg=node_modules/tsx/dist/cli.mjs `
  --adapter-arg=benchmark/providers/openai-stdio.ts
```

The runner refuses to call the provider if the Git commit, lockfile, or shard
manifest differs from the plan. It also refuses to overwrite an existing
report. Reports are written atomically and are retained even when generated
artifacts fail evaluation.

For another provider, implement the standard-stream adapter contract in
`benchmark/ADAPTER.md`. The resolved provider and immutable version, observed
charge, and pricing source must exactly match the locked plan or the finished
job is invalid.

## Inspect progress

```powershell
npm run benchmark:official:status -- `
  --bundle work/official-development `
  --output work/official-development/status.json
```

Use `--require-complete` in automation. `missing` means a job has not produced a
report and can still be run. `invalid` means evidence exists but its provenance
or exact run set is unacceptable; it must not be silently replaced or excluded.

## Current start gate

Do not start paid official generation until all of the following are supplied
and reviewed:

- exact raw-API model and immutable version for all three strata;
- credentials for every selected provider;
- dated pricing source and rates matching adapter output;
- an explicit spending envelope for 2,025 development runs and possible
  repairs;
- final deterministic acceptance checks to be frozen before holdout exposure.

The current environment has no configured raw-provider credentials or locked
price card, so only the zero-cost preparation and status dry run is presently
valid.
