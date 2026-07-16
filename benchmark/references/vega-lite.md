# Vega-Lite v6 generation reference

Return one JSON Vega-Lite specification and no Markdown fence. Acceptance
compiles the document with the installed Vega-Lite v6 package and parses the
result with the installed Vega runtime.

Use `$schema: "https://vega.github.io/schema/vega-lite/v6.json"`. GeoJSON may
be loaded with `data.url` and `data.format: {"property":"features"}` or used
as feature objects where appropriate. Geographic polygon maps generally use a
`geoshape` mark and a quantitative or nominal `color` encoding. Point maps use
longitude and latitude encodings with `circle` or `point`. Labels can be a
layered `text` mark. Legends must be generated from the same encoding field and
unit shown by the marks.

When a requirement needs multiple marks, use a top-level `layer` array and
repeat the data definition or use shared top-level data. Missing values must be
made visibly distinct when requested. Return a complete specification, not
JavaScript or a Vega runtime document.
