# Atlaspec

Atlaspec is an intent-first cartographic intermediate representation for agents
and humans. It turns compact, semantic map specifications into deterministic
renderer-native output while keeping data correctness, accessibility, and
cartographic constraints testable.

The project is benchmark-first. Its primary claim is not that Atlaspec is a
shorter syntax; it is that an agent can produce an accepted map more reliably
and at lower total cost than when it writes renderer configuration directly.

## Status

Atlaspec is in pre-alpha development. Version 0.1 is limited to two-dimensional
thematic maps and a MapLibre Style Specification compilation target.

The initial map families are:

- choropleth maps;
- proportional-symbol maps;
- categorical point maps;
- density and heat maps.

Navigation, 3D scenes, raster analysis, and general-purpose GIS processing are
explicitly out of scope for version 0.1.

## Planned pipeline

```text
natural language or UI
        |
        v
Atlaspec CIR document
        |
        +--> schema validation
        +--> cartographic linting
        +--> deterministic decision trace
        v
MapLibre style document
```

## Project contracts

- [Version 0.1 scope](docs/SCOPE.md)
- [Benchmark and success criteria](docs/BENCHMARK.md)
- [Failed initial local qualification](docs/LOCAL_QUALIFICATION_2026-07-20.md)
- [Post-fix local R&D and closure probe](docs/LOCAL_POSTFIX_RND_2026-07-20.md)
- [One-time local holdout lock](docs/LOCAL_HOLDOUT_LOCK_2026-07-20.md)
- [One-time local holdout result](docs/LOCAL_HOLDOUT_2026-07-20.md)

These documents are steering constraints. Changes to them must be explicit and
must not be made merely to accommodate observed benchmark results.

## Development usage

```powershell
npm install
npm run check
npm run atlaspec -- validate examples/flood-risk.atlas.yaml
npm run atlaspec -- validate examples/shelter-capacity.atlas.yaml --json
npm run atlaspec -- compile examples/flood-risk.atlas.yaml
npm run atlaspec -- compile examples/shelter-capacity.atlas.yaml --output shelter-style.json
```

Validation has two stages: strict schema validation followed by deterministic
cartographic linting. Diagnostics have stable, grep-friendly codes so agents can
repair a document without parsing prose or relying on a visual judge.

Compilation emits a MapLibre v8 style with Atlaspec intent, legend metadata, and
a deterministic decision trace. The trace records every inferred palette,
domain, scale, basemap, and clustering decision together with its reason.

Run the executable compiler pilot benchmark with:

```powershell
npm run benchmark:smoke
```

The pilot reports Reliable Map Yield for all four supported families and fails
the process if any schema, semantic, MapLibre, layer, or decision-trace check
regresses. It is infrastructure for the full model comparison, not a substitute
for the pre-committed 48-task benchmark.

Run provider-neutral comparative experiments with:

```powershell
npm run atlasbench -- `
  --manifest benchmark/comparison.example.json `
  --adapter node `
  --adapter-arg=path/to/provider-adapter.mjs `
  --report work/comparison-report.json
```

See [the AtlasBench harness](benchmark/README.md) and
[generation adapter contract](benchmark/ADAPTER.md). Comparative reports keep
failed attempts in the denominator and distinguish automated gates from the
still-required human and multi-model evidence.

The frozen benchmark corpus contains 48 cells, split into 36 development and 12
holdout tasks. Validate it with `npm run corpus:check` and create model-specific
run manifests with `npm run corpus:prepare`; frozen manifests should not be
edited directly.

## License

MIT
