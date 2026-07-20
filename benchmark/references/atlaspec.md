# Atlaspec 0.1 generation reference

Return exactly one YAML document. The first bytes must be `version:`; do not
add prose, backticks, a Markdown fence, or a `---` marker. Atlaspec rejects
unknown keys. Use only the keys and values listed below, even when another key
would seem reasonable.

## Exact object grammar

Key notation: `*` means required; all unmarked keys are optional.

- document: `version*`, `map*`, `title*`, `description`, `family*`, `intent*`, `data*`, `encoding*`, `constraints`, `behavior`, `basemap`, `metadata`
  - version: `0.1`
  - family: `choropleth`, `proportional-symbol`, `categorical-point`, `heatmap`
- intent: `task*`, `audience*`, `primary_message*`
  - task: `locate`, `compare`, `rank`, `distribution`, `distinguish`
  - audience: `general-public`, `analyst`, `expert`, `operations`, `student`
- data: `sources*`, `fields*`
- each source, exactly one shape:
  - `id*`, `type*`, `url*`; type: `geojson`
  - `id*`, `type*`, `data*`; type: `geojson`
- each field: `source*`, `path*`, `measurement*`, `semantic_type*`, `unit`, `normalization`, `range`, `domain`
  - measurement: `nominal`, `ordinal`, `quantitative`, `temporal`
  - semantic_type: `category`, `count`, `rate`, `probability`, `delta`, `rank`, `capacity`, `uncertainty`, `identifier`, `label`
  - normalization: `none`, `ratio`, `per-capita`, `density`
- encoding: `geometry*`, `color`, `size`, `category`, `label`, `weight`
  - geometry object: `source*`, `support*`
    - support: `point`, `line`, `polygon`, `grid`
  - color object: `field*`, `scheme`, `classification`, `classes`
    - classification: `continuous`, `equal-interval`, `quantile`, `natural-breaks`
  - size, category, label, and weight objects: `field` only
- constraints: `colorblind_safe`, `missing_data`, `raw_count_choropleth`, `protected_layers`, `label_priority`, `viewport`
  - missing_data: `explicit`, `hide`, `error`
  - raw_count_choropleth: `reject` or `allow`
  - viewport object: `width*`, `height*`
- behavior: `zoom_rules*`
  - each zoom rule: `min_zoom`, `max_zoom`, `target*`, `action*`
  - target: `fill`, `symbols`, `labels`, `heatmap`
  - action: `show`, `hide`, `cluster`, `show-labels`
- basemap: `style*`, `contrast`
  - style: `minimal-light`, `minimal-dark`, `none`
  - contrast: `light`, `dark`, `auto`

Do not put `zoom`, `zoom_rules`, or scale settings at the document root or
inside `constraints`. Semantic zoom belongs only at
`behavior.zoom_rules`. Do not add `scale`, `range`, or
`classification` under `encoding.size`; do not add `palette`, `domain`,
or `missing` under `encoding.category`; do not add `classification` under
`encoding.weight`. Those renderer decisions are compiler-derived.

## Family contracts

- `choropleth`: polygon geometry and `color` are required. The color field
  must be ordered. A raw count requires normalization or an explicit
  `raw_count_choropleth: allow` override.
- `proportional-symbol`: point geometry and `size` are required. The size
  field must be quantitative. Area-proportional scaling is compiler-derived;
  write only `size: {field: ...}`.
- `categorical-point`: point geometry and `category` are required. The
  category field must be nominal and declare its string `domain` on the field.
  The colorblind-safe palette is compiler-derived.
- `heatmap`: point or grid geometry is required. `weight` is optional; when
  present its field must be ordinal or quantitative. Kernel, radius, intensity,
  and palette are compiler-derived.

Probability fields are quantitative and stay within `[0, 1]`. Category and
label fields are nominal. Counts and capacities are quantitative, use
`normalization: none`, and have a nonnegative range.

## Complete choropleth example

```yaml
version: "0.1"
map: stable-slug
title: Human title
family: choropleth
intent:
  task: compare
  audience: analyst
  primary_message: Compare the encoded probability across regions.
data:
  sources:
    - id: areas
      type: geojson
      url: ./data.geojson
  fields:
    value:
      source: areas
      path: risk_rate
      measurement: quantitative
      semantic_type: probability
      unit: probability
      normalization: ratio
      range: [0, 1]
    name:
      source: areas
      path: name
      measurement: nominal
      semantic_type: label
encoding:
  geometry: {source: areas, support: polygon}
  color: {field: value, classification: continuous}
  label: {field: name}
constraints:
  colorblind_safe: true
  missing_data: explicit
  raw_count_choropleth: reject
  viewport: {width: 960, height: 640}
behavior:
  zoom_rules:
    - {min_zoom: 7, target: labels, action: show-labels}
basemap: {style: minimal-light, contrast: light}
```

For proportional symbols replace the value field with a quantitative capacity
field and use `family: proportional-symbol`, point geometry, and
`size: {field: capacity}`. For categorical points declare a nominal category
field with `semantic_type: category` and `domain: [clinic, shelter, depot]`,
then use `category: {field: category}`. For a heatmap declare an ordinal or
quantitative severity field and use `weight: {field: severity}`.

There is no authored `legend` key. A legend request is satisfied by the
encoding field and its semantic type, unit, range, or domain. The compiler
derives MapLibre `metadata["atlaspec:legend"]`.
