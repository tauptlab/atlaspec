# Atlaspec 0.2 generation reference

Return exactly one YAML document beginning with `version:`. Do not emit prose,
Markdown fences, backticks, headings, or a `---` marker. Unknown keys are
rejected. Atlaspec 0.2 represents one ordered map as an ordered `layers` array.

Key notation: `*` means required; all unmarked keys are optional.

- document: `version*`, `map*`, `title*`, `description`, `intent*`, `data*`, `layers*`, `constraints`, `basemap`, `metadata`
  - version: `0.2`
- intent: `task*`, `audience*`, `primary_message*`
- data: `sources*`, `fields*`
- each source, exactly one shape:
  - `id*`, `type*`, `url*`; type: `geojson`
  - `id*`, `type*`, `data*`; type: `geojson`
- each field: `source*`, `path*`, `measurement*`, `semantic_type*`, `unit`, `normalization`, `range`, `domain`
  - measurement: `nominal`, `ordinal`, `quantitative`, `temporal`
  - semantic_type: `category`, `count`, `rate`, `probability`, `delta`, `rank`, `capacity`, `uncertainty`, `identifier`, `label`
  - normalization: `none`, `ratio`, `per-capita`, `density`
  - range is exactly two numbers; domain is an array of unique strings
- each layer: `id*`, `purpose*`, `family*`, `encoding*`, `constraints`, `behavior`
  - purpose: `primary`, `supporting`, `reference`
  - family: `choropleth`, `proportional-symbol`, `categorical-point`, `heatmap`
  - encoding: `geometry*`, `color`, `size`, `category`, `label`, `weight`
  - geometry: `source*`, `support*`
  - color: `field*`, `scheme`, `classification`, `classes`
  - size, category, label, and weight contain only `field`
  - constraints: `missing_data`, `raw_count_choropleth`
  - missing_data: `explicit`, `hide`, `error`
  - behavior: `zoom_rules*`
  - each zoom rule: `min_zoom`, `max_zoom`, `target*`, `action*`
  - zoom target: `fill`, `symbols`, `labels`, `heatmap`
  - zoom action: `show`, `hide`, `cluster`, `show-labels`
- global constraints: `colorblind_safe`, `allow_duplicate_labels`, `protected_layers`, `label_priority`, `viewport`
  - viewport: `width*`, `height*`
- basemap: `style*`, `contrast`

Every field reference in a layer must name a key in `data.fields`; that field's
`source` must match the layer geometry source. Keep layer IDs stable and keep
the authored layer order. Put `missing_data` and `raw_count_choropleth` on
the layer, while viewport and colorblind safety are global constraints. Put
semantic zoom only in the relevant layer's `behavior.zoom_rules`.

Family requirements:

- choropleth: polygon geometry plus ordered color; raw counts need normalization
  or `raw_count_choropleth: allow`;
- proportional-symbol: point geometry plus quantitative size;
- categorical-point: point geometry plus nominal category with a string domain;
- heatmap: point or grid geometry and optional ordinal or quantitative weight.

There is no authored legend key. Legends, scales, palettes, symbol radii, and
heatmap kernels are compiler-derived from field semantics and encodings.

Complete two-layer shape:

```yaml
version: "0.2"
map: stable-map
title: Stable map
intent:
  task: compare
  audience: operations
  primary_message: Compare regional risk and facility capacity.
data:
  sources:
    - {id: areas, type: geojson, url: data/areas.geojson}
    - {id: sites, type: geojson, url: data/sites.geojson}
  fields:
    risk:
      {source: areas, path: risk_rate, measurement: quantitative, semantic_type: probability, normalization: ratio, range: [0, 1]}
    capacity:
      {source: sites, path: capacity, measurement: quantitative, semantic_type: capacity, unit: people, normalization: none, range: [0, 10000]}
layers:
  - id: risk
    purpose: primary
    family: choropleth
    encoding:
      geometry: {source: areas, support: polygon}
      color: {field: risk}
    constraints: {missing_data: explicit, raw_count_choropleth: reject}
  - id: sites
    purpose: supporting
    family: proportional-symbol
    encoding:
      geometry: {source: sites, support: point}
      size: {field: capacity}
    constraints: {missing_data: error}
constraints: {colorblind_safe: true, viewport: {width: 960, height: 640}}
basemap: {style: minimal-light, contrast: light}
```
