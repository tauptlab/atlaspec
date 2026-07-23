# Atlaspec 0.2 Scope

## Objective

Atlaspec 0.2 extends the proven single-theme Cartographic Intent
Representation into a composable, renderer-independent map document.

Version 0.1 demonstrated that an agent can generate one semantic thematic map
more reliably than it can author renderer-native configuration. Version 0.2
must test the harder and more useful case: a map that combines multiple
thematic layers while preserving intent, validation, deterministic compilation,
and localized edit safety.

The release has four primary outcomes:

1. compose multiple thematic layers in one map;
2. preserve complete Atlaspec 0.1 validation and MapLibre behavior;
3. compile the representable subset to a second backend, Vega-Lite;
4. evaluate v0.2 on a fresh corpus whose holdout is never used for tuning.

## Versioned document model

Atlaspec 0.2 introduces a `layers` array. Map-level intent, data, viewport, and
basemap remain shared. Family-specific encoding, missing-data behavior, and
semantic zoom move into stable layer objects.

```yaml
version: "0.2"
map: response-overview
title: Flood risk and emergency shelters
intent:
  task: compare
  audience: operations
  primary_message: Compare flood risk while locating high-capacity shelters.
data:
  sources: []
  fields: {}
layers:
  - id: flood-risk
    purpose: primary
    family: choropleth
    encoding: {}
    constraints: {}
    behavior: {}
  - id: shelters
    purpose: supporting
    family: proportional-symbol
    encoding: {}
constraints: {}
basemap: {}
```

### Layer contract

Each layer contains:

- a unique slug-form `id` used for stable compilation and edits;
- a `purpose`: `primary`, `supporting`, or `reference`;
- one existing map `family`;
- one family-valid `encoding` object;
- optional layer-local constraints for missing data and raw-count choropleths;
- optional layer-local semantic zoom behavior.

Exactly one layer must have `purpose: primary`. Array order is renderer draw
order from bottom to top. The primary layer is not required to be first, but
compilers and evaluators must preserve authored order.

Layer IDs namespace generated renderer layer IDs and decision paths. A localized
edit to one layer must not rename or rewrite unrelated compiled layers.

### Map-level contract

The following remain map-level:

- `map`, `title`, `description`, and communication `intent`;
- shared data sources and semantic field declarations;
- color-vision-deficiency requirements;
- protected layer IDs and label priority;
- viewport dimensions;
- basemap style and contrast;
- scalar metadata.

`protected_layers` in 0.2 contains Atlaspec layer IDs, not renderer layer IDs.
Every referenced protected layer must exist.

## Version 0.1 compatibility

Atlaspec 0.2 must not invalidate a valid 0.1 document.

- `AtlaspecSchema` accepts both versions through explicit version branches.
- Version-specific schemas and types remain exported.
- `validateAtlaspec` and `compileMapLibre` accept both versions.
- Compiling an unchanged 0.1 document remains byte-for-byte deterministic with
  the current 0.1 compiler output.
- An exported `upgradeAtlaspec` function converts 0.1 to canonical 0.2 without
  guessing new semantic content.
- Upgrade wraps the existing family, encoding, constraints, and behavior in a
  single `main` layer with `purpose: primary`.
- Upgrade is idempotent for an existing 0.2 document and never mutates input.
- Downgrade is supported only when a 0.2 document has exactly one layer and no
  0.2-only semantics; otherwise it fails closed.

No implicit file rewrite occurs during validation or compilation.

## Multi-layer semantic rules

Version 0.2 adds deterministic lint rules for:

- duplicate layer IDs;
- zero or multiple primary layers;
- unknown protected layer IDs;
- field/source mismatches within each layer;
- family/geometry mismatches within each layer;
- conflicting semantic zoom ranges within a layer;
- duplicate labels from the same field and source unless explicitly allowed;
- more than one heatmap at the same draw level;
- primary information hidden for the complete declared zoom range;
- unreadable combinations of primary and supporting quantitative color layers.

Diagnostics use stable codes and JSON Pointer paths rooted at
`/layers/{index}`. A failure in one layer never suppresses diagnostics from the
other layers.

## MapLibre target

MapLibre remains the complete required backend.

The 0.2 compiler must:

- compile every supported family in every valid layer;
- preserve authored layer order;
- deduplicate shared MapLibre sources without changing source semantics;
- namespace renderer layer IDs as `{map}-{layer}-{role}`;
- emit one legend descriptor per encoded thematic layer;
- attach every decision to its Atlaspec layer path;
- apply layer-local zoom behavior without affecting sibling layers;
- keep global label and protected-layer constraints traceable;
- pass official MapLibre style validation without warnings or dropped intent.

## Vega-Lite target

Vega-Lite v6 becomes the second compiler target. It exists to verify that
Atlaspec semantics are portable, not to claim feature parity with MapLibre.

The initial 0.2 Vega-Lite compiler supports:

- choropleth layers as `geoshape` marks;
- proportional-symbol layers as area-scaled `circle` marks;
- categorical-point layers as nominal-color `circle` marks;
- text labels as layered `text` marks;
- shared geographic projection and viewport configuration;
- deterministic legends derived from field semantics;
- layered composition when all member layers are representable.

A map that requires unsupported heatmap kernels, clustering, or MapLibre-only
semantic zoom must fail with capability diagnostics. The compiler must never
drop, approximate, or rewrite an unsupported requirement silently. The emitted
specification must compile to Vega with zero Vega-Lite compiler warnings.

## Public API and CLI

The intended public surface is:

- `AtlaspecV01Schema`, `AtlaspecV02Schema`, and union `AtlaspecSchema`;
- version-specific document and layer types;
- `upgradeAtlaspec` and guarded `downgradeAtlaspec`;
- `compileMapLibre` for both document versions;
- `compileVegaLite` for supported 0.2 documents;
- shared validation and diagnostic types.

CLI additions:

```text
atlaspec upgrade <file> [--output <file>]
atlaspec compile <file> --target maplibre|vega-lite
atlaspec capabilities <file> --target maplibre|vega-lite
```

The default compile target remains MapLibre for compatibility.

## Non-goals for 0.2

- routing, turn-by-turn navigation, or network analysis;
- spatial joins, buffering, aggregation, or general geoprocessing;
- vector-tile production or server-side tile hosting;
- raster, satellite, or remote-sensing analysis;
- globe, terrain, extrusion, or 3D scenes;
- arbitrary MapLibre or Vega-Lite feature parity;
- general UI layout or dashboard composition;
- automatic recovery of intent from screenshots;
- renderer-specific escape hatches that bypass semantic validation.

## Release boundary

The repository may develop 0.2 features while the package version remains
pre-release. `version: "0.2"` and package version `0.2.0` are release-ready only
after compatibility, compiler, capability, fresh-corpus, and documentation
gates in `BENCHMARK_0.2.md` pass. Partial work must stay labeled experimental.

Current status on 2026-07-23: `version: "0.2"` is the latest recommended
document contract and package `0.2.0-rc.1` is a research release candidate.
Stable `0.2.0` is not declared because the Codex total uncached-token
development gate remains failed and the one-time v0.2 holdout remains sealed.
This status records the observed result without weakening the precommitted
release boundary.
