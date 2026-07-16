# Atlaspec 0.1 Scope

## Objective

Atlaspec 0.1 will define and implement a Cartographic Intent Representation
(CIR) for deterministic generation of two-dimensional thematic maps.

The representation must let an author state what the map is for, what the data
means, and which constraints are mandatory without requiring renderer-specific
layer, expression, legend, or palette configuration.

## Supported intent

Version 0.1 supports these map-reading tasks:

- locate a geographic feature;
- compare values between geographic features;
- rank features by a quantitative attribute;
- identify spatial distribution or concentration;
- distinguish nominal categories;
- communicate probability, rate, count, delta, and uncertainty.

## Supported data semantics

Each encoded field declares both a measurement level and, where applicable, a
domain semantic type.

Measurement levels:

- nominal;
- ordinal;
- quantitative;
- temporal.

Initial domain semantic types:

- category;
- count;
- rate;
- probability;
- delta;
- rank;
- capacity;
- uncertainty;
- identifier;
- label.

Spatial supports:

- point;
- line;
- polygon;
- grid.

## Supported map families

### Choropleth

Polygon fill encodes a normalized quantitative, ordinal, probability, rate, or
delta field. Raw counts are rejected by default unless an explicit override is
present because unequal area can make raw-count choropleths misleading.

### Proportional symbol

Symbol area encodes a non-negative quantitative value at point locations or
polygon representative points.

### Categorical point

Point color or shape encodes a nominal category. Symbol size may additionally
encode a non-negative quantitative value.

### Density or heat

Point events or grid cells encode concentration. The compiler must preserve the
difference between raw event density and already aggregated measurements.

## Initial compiler target

The only required 0.1 backend is a MapLibre Style Specification document.
Atlaspec owns semantic decisions and emits renderer-native sources, layers,
filters, expressions, and metadata. Hosting, tile generation, and application
shell code remain the caller's responsibility.

Vega-Lite geographic output is a candidate second backend after the MapLibre
contract and benchmark are stable.

## Required cross-cutting behavior

- explicit representation of missing data;
- color-vision-deficiency-safe palette selection when requested;
- deterministic compilation for identical inputs and compiler version;
- stable diagnostic codes;
- a machine-readable decision trace for inferred settings;
- fail-closed validation when a semantic mapping would be misleading;
- renderer escape hatches that are visibly marked and never silently inferred;
- schema versioning from the first published document.

## Non-goals for 0.1

- turn-by-turn navigation or routing;
- spatial analysis or geoprocessing;
- vector-tile production;
- satellite or remote-sensing image analysis;
- globe, terrain, extrusion, or other 3D rendering;
- general UI layout;
- automatic recovery of design intent from screenshots;
- arbitrary MapLibre feature parity;
- replacing GeoJSON, MapLibre, or Vega-Lite.

## Compatibility position

Atlaspec is a semantic layer above existing data and renderer formats. GeoJSON
remains the initial interchange format for geographic features, and MapLibre
remains the renderer contract. Atlaspec should compile to these formats rather
than fork or partially reimplement them.
