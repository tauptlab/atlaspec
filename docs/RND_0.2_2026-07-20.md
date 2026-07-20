# Atlaspec 0.2 semantic-loss R&D

Date: 2026-07-20

## Objective

This pass tried to falsify the claim that a valid Atlaspec 0.2 document is
compiled without silently losing authored intent. It focused on deterministic
counterexamples in semantic zoom, shared MapLibre sources, multi-layer
occlusion, renderer field syntax, and missing-data behavior.

This is implementation evidence, not a model-performance result. No
AtlasBench 0.2 development or holdout model calls were run.

## Findings and remediation

| Finding | Previous behavior | Remediation |
|---|---|---|
| bounded `hide` interval | emitted reversed `minzoom`/`maxzoom` bounds | fail closed with `behavior.bounded-hide-unsupported` |
| invalid zoom action/target | compiler ignored cluster/show-label rules on unavailable roles | validate action/target compatibility and require a real emitted role |
| repeated visibility rules | later rule overwrote earlier output in authored order | reject order-dependent duplicate visibility rules per target |
| shared source clustering | first cluster rule silently selected for sibling layers | reject multiple rules and cross-layer `clusterMaxZoom` disagreement |
| same-source choropleths | later opaque fill could hide the earlier thematic fill | reject deterministic same-source choropleth occlusion |
| Vega field paths | dots and brackets could change a literal property into a nested lookup | escape Vega field definitions separately from expression access |
| Vega missing values | `hide` was not filtered and explicit categorical missing values lacked a scale entry | emit filters, materialize `Missing`, and fail closed for unsupported proportional-symbol explicit missing legends |
| MapLibre hidden values | `missing_data: hide` was declarative but not applied to most layer types | add thematic and label filters, including conjunction with cluster filters |

All new failures use stable diagnostic codes and JSON Pointer paths. Atlaspec
0.2 diagnostics remain rooted at `/layers/{index}` where the error is local to
a semantic layer.

## Verification

The completed pass added 12 regression tests, bringing the suite from 90 to
102 tests across 24 test files. The final verification command is:

```powershell
npm run check
npm run build
```

The checks cover:

- TypeScript strict type checking;
- all unit, compiler, migration, CLI-adjacent, and benchmark tests;
- official MapLibre minimum-style validation;
- warning-free Vega-Lite compilation and Vega runtime parsing;
- the frozen AtlasBench 0.1 corpus and generation reference;
- the locked AtlasBench 0.2 task matrix;
- SHA-256-frozen compiler results for all four canonical 0.1 examples.

## Remaining risks

### Missing-data completeness

MapLibre and Vega-Lite currently distinguish an absent property with `has` or
`isValid`, but the compatibility-preserving MapLibre 0.1 path does not yet
treat every `null`, `NaN`, string, and renderer conversion failure identically.
An explicit missing symbol plus complete legend is not yet supported for
Vega-Lite proportional-symbol layers and therefore fails capability inspection.
MapLibre explicit missing treatment for proportional symbols and weighted
heatmaps still needs a renderer-normalized contract and tests.

### Visual occlusion beyond shared sources

Same-source polygon fill occlusion is now deterministic and rejected. Two
different sources can still contain coincident or overlapping polygons; that
requires spatial data inspection or rendered-image checks rather than schema
inspection alone.

### Duplicate label policy

The scope permits duplicate labels when explicitly allowed, but 0.2 does not
yet expose such an opt-in. The validator currently rejects duplicate
source/field label pairs conservatively.

### Runtime and human evidence

Vega-Lite specifications compile without warnings, but external GeoJSON fetch,
browser rendering, viewport screenshots, map-reading accuracy, and blind
cartographer review remain unmeasured. The fresh v0.2 datasets are now locked,
and compiler-produced artifacts now share a verified renderer-neutral semantic
record. Independent direct-renderer normalization, executable manifests, the
complete edit-survival evaluator, and model runs remain pending.

## Current conclusion

The pass found real semantic-loss paths despite a previously green suite, so
the additional R&D was useful. Atlaspec 0.2 is materially safer after these
changes, but it remains experimental. Stability and performance claims still
depend on completing the locked AtlasBench 0.2 workflow and the remaining
renderer/runtime checks above.
