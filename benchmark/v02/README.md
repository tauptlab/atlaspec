# AtlasBench 0.2 corpus status

This directory contains the pre-model-call task matrix for the fresh Atlaspec
0.2 evaluation. It deliberately does not reuse the AtlasBench 0.1 holdout.

The checked-in `matrix.json` locks:

- four multi-layer composition archetypes;
- three difficulty levels and four adversarial/data variants;
- 48 unique task cells with a deterministic 36/12 development/holdout split;
- five planned repetitions;
- a fixed bootstrap seed for task-clustered intervals;
- 33 cross-renderer-representable tasks and 15 capability-negative controls;
- stable localized-edit targets and planned data paths.

The same generator now locks 36 fresh GeoJSON files covering missing values,
skew, dense overlap, multilingual labels, mobile-density stress, high latitude,
and antimeridian-adjacent geometry. Every task data path resolves to a generated
artifact and is checked byte-for-byte in `npm run check`.

Regenerate and verify the matrix with:

```powershell
npm run corpus:v02:generate
npm run corpus:v02:check
```

## Evidence boundary

The matrix, GeoJSON datasets, prompts, per-layer hard requirements, condition
sets, and development/holdout manifests are locked. Compiler-produced MapLibre and
Vega-Lite artifacts now carry and verify a common semantic record, including
an unrelated-layer edit-survival comparison. Metadata-free direct MapLibre and
Vega-Lite artifacts are checked for source files, authored order, renderer
roles, and field bindings against the locked task contracts. The generation
runner, complete two-turn edit evaluator, development runs, and one-time
holdout runs are still pending. `status: contracts-locked-runner-pending` is
part of the generated artifact so the corpus cannot be mistaken for an
executable or completed benchmark.

The controlling hypotheses, gates, and analysis rules are in
[`docs/BENCHMARK_0.2.md`](../../docs/BENCHMARK_0.2.md). Do not change the locked
matrix after model output has been inspected; create a new corpus version if a
material task-design change is required.
