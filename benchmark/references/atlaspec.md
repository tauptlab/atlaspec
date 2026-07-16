# Atlaspec 0.1 generation reference

Return one YAML document and no Markdown fence. Unknown keys are errors.

Required top-level keys are `version: "0.1"`, slug-form `map`, `title`,
`family`, `intent`, `data`, and `encoding`.

Families and required encodings:

- `choropleth`: polygon `geometry` and quantitative `color`;
- `proportional-symbol`: point `geometry` and quantitative `size`;
- `categorical-point`: point `geometry` and nominal `category`;
- `heatmap`: point `geometry`; quantitative `weight` is optional.

Minimal structure:

```yaml
version: "0.1"
map: stable-slug
title: Human title
family: choropleth
intent:
  task: compare
  audience: analyst
  primary_message: A concrete map-reading goal.
data:
  sources:
    - id: areas
      type: geojson
      url: ./data.geojson
  fields:
    value:
      source: areas
      path: property_name
      measurement: quantitative
      semantic_type: rate
      unit: percent
      normalization: ratio
      range: [0, 100]
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
basemap: {style: minimal-light, contrast: light}
```

Allowed measurement values: `nominal`, `ordinal`, `quantitative`, `temporal`.
Allowed semantic types: `category`, `count`, `rate`, `probability`, `delta`,
`rank`, `capacity`, `uncertainty`, `identifier`, `label`. Probability ranges
must stay inside `[0, 1]`. Choropleths must not encode raw counts unless
`raw_count_choropleth: allow` is explicitly justified; prefer a rate or ratio.
Nominal categories require a unique string `domain`. Counts and capacity use
`normalization: none` and a nonnegative range.

Optional zoom rules contain `min_zoom` or `max_zoom`, a target (`fill`,
`symbols`, `labels`, `heatmap`), and an action (`show`, `hide`, `cluster`,
`show-labels`). Basemap style is `minimal-light`, `minimal-dark`, or `none`.
