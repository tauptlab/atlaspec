# AtlasBench 0.2 corpus status

This directory contains the pre-model-call task matrix for the fresh Atlaspec
0.2 evaluation. It deliberately does not reuse the AtlasBench 0.1 holdout.

The checked-in `matrix.json` locks:

- four multi-layer composition archetypes;
- three difficulty levels and four adversarial/data variants;
- 48 unique task cells with a deterministic 36/12 development/holdout split;
- five planned repetitions;
- a fixed bootstrap seed for task-clustered intervals;
- 22 cross-renderer-representable tasks and 26 capability-negative controls;
- stable localized-edit targets and planned data paths.

The same generator now locks 36 fresh GeoJSON files covering missing values,
skew, dense overlap, multilingual labels, mobile-density stress, high latitude,
and antimeridian-adjacent geometry. Every task data path resolves to a generated
artifact and is checked byte-for-byte in `npm run check`.

Regenerate and verify the matrix with:

```powershell
npm run corpus:v02:generate
npm run corpus:v02:check
npm run benchmark:v02:dry-run
npm run benchmark:v02:run -- --help
```

The deterministic dry-run currently replays all 48 tasks and 214 declared
conditions through reference generation, parsing, official renderer validation,
compiler capability checks, and locked semantic checks. It passes 214/214 with
`model_calls: 0`. This proves evaluator consistency, not model performance.

## Evidence boundary

The matrix, GeoJSON datasets, prompts, per-layer hard requirements, condition
sets, and development/holdout manifests are locked. Compiler-produced MapLibre and
Vega-Lite artifacts now carry and verify a common semantic record, including
an unrelated-layer edit-survival comparison. Metadata-free direct MapLibre and
Vega-Lite artifacts are checked for source files, authored order, renderer
roles, and field bindings against the locked task contracts. The model runner
now preserves prompts, inputs, raw responses, token/charge/latency records,
validation failures, one diagnostic repair, and localized second-turn edits.
Condition order rotates by locked task position and repetition to limit
provider-cache and order bias. The runner refuses to overwrite a report.
`status: runner-ready-model-runs-pending`
means the executable contract is ready, but no v0.2 performance evidence has
yet been produced.

Run a small development qualification before any full matrix:

```powershell
$codex = (codex --version).Trim()
npm run benchmark:v02:run -- `
  --manifest benchmark/v02/development.manifest.json `
  --output .atlasbench/v02/codex-qualification.json `
  --provider codex-cli `
  --model default `
  --version "$codex;model=unreported" `
  --repetitions 1 `
  --task-id choropleth-proportional-symbols-basic-missing-and-skew
```

For Claude, use `--provider claude-cli`, pass the CLI selector with `--model`,
and pass the exact resolved model ID reported by Claude Code with `--version`.
Development repetition overrides are qualification-only. The one-time holdout
must use the committed five repetitions and must never be used for tuning.

The next multi-task local qualification is prepared separately before calls:

```powershell
npm run benchmark:v02:local:prepare -- `
  --output work/v02-qualification `
  --codex-version "codex-cli 0.144.4" `
  --claude-cli-version "2.1.17 (Claude Code)" `
  --claude-model opus `
  --claude-version claude-opus-4-5-20251101
```

The ledger deterministically selects 12 development-only tasks, two
repetitions, and six agent/difficulty jobs. It locks 216 condition runs and a
maximum of 408 calls including edits and possible repairs. This larger budget
is deliberate and visible before execution; preparing it does not call a model
or expose holdout data.

After committing the prepared-run code and creating the bundle, execute and
inspect one immutable shard at a time:

```powershell
npm run benchmark:v02:local:run-job -- `
  --bundle work/v02-qualification --job codex/basic

npm run benchmark:v02:local:status -- `
  --bundle work/v02-qualification
```

Each job refuses compiler, dependency-lock, source-manifest, or matrix drift;
prints progress after every completed run; and writes its report atomically.
It also writes an atomic checkpoint after every run. Repeating the same command
with the same plan resumes only missing run IDs, while status reports the job as
`partial`; invalid or foreign checkpoint records are rejected.
The status command rejects missing, duplicate, unexpected, wrong-model, or
wrong-commit runs instead of silently aggregating them. Once all three jobs for
an agent are complete, it also reports task-clustered bootstrap intervals and
separate gates for first-attempt reliability, uncached generation tokens,
generation output tokens, Atlaspec edit survival, cross-renderer portability,
and capability fail-closed accuracy. Missing response usage keeps reliability
failures in the denominator but makes token evidence insufficient. Repair
recovery is descriptive because the direct baseline has no symmetric repair
condition.

The controlling hypotheses, gates, and analysis rules are in
[`docs/BENCHMARK_0.2.md`](../../docs/BENCHMARK_0.2.md). Do not change the locked
matrix after model output has been inspected; create a new corpus version if a
material task-design change is required.

## Completed local qualification

The locked 12-task, two-repetition local qualification completed 216/216 runs
on 2026-07-21. Both agents received an overall fail. Claude passed reliability
and token-efficiency gates but failed portability and capability fail-closed;
Codex also failed reliability. The v0.2 holdout remains sealed.

See the full result, immutable report hashes, and claim boundary in the
[multi-task qualification report](../../docs/V02_MULTI_TASK_QUALIFICATION_2026-07-21.md).
