# MapLibre Style v8 generation reference

Return one JSON style document and no Markdown fence. The installed official
MapLibre style validator is authoritative for acceptance.

The root requires `version: 8`, `sources`, and `layers`. GeoJSON sources use
`{"type":"geojson","data":"./data.geojson"}`. Every data layer references
an existing source. Common thematic layers:

- choropleth: `type: "fill"`, with a data-driven `fill-color` expression;
- proportional or categorical points: `type: "circle"`;
- density: `type: "heatmap"`;
- labels: `type: "symbol"` with `text-field` in `layout`.

Use MapLibre expressions such as `get`, `has`, `case`, `match`, `interpolate`,
`step`, `to-number`, and `zoom`. Missing values requested as explicit must have
a visible fallback rather than silently inheriting the minimum color. A
proportional-symbol radius must use a square-root transform so symbol area, not
radius, represents the value. Keep layer identifiers unique and return a
self-contained style rather than JavaScript application code.
