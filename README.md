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

## License

MIT
