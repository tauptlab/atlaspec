import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  AtlaspecLayerSchema,
  AtlaspecV01Schema,
  AtlaspecV02Schema,
  DataSourceSchema,
  EncodingSchema,
  FieldSchema,
  MapFamilySchema,
  LayerPurposeSchema,
  SpatialSupportSchema,
} from '../../src/schema.js';

interface SchemaNode {
  properties?: Record<string, SchemaNode>;
  required?: string[];
  anyOf?: SchemaNode[];
  items?: SchemaNode;
  const?: unknown;
}

export function renderAtlaspecReference(): string {
  const root = node(AtlaspecV01Schema);
  const intent = property(root, 'intent');
  const constraints = property(root, 'constraints');
  const behavior = property(root, 'behavior');
  const zoomRule = property(behavior, 'zoom_rules').items!;
  const basemap = property(root, 'basemap');
  const color = property(node(EncodingSchema), 'color');
  const sourceAlternatives = node(DataSourceSchema).anyOf ?? [];

  const familyValues = enumValues(node(MapFamilySchema));
  const taskValues = enumValues(property(intent, 'task'));
  const audienceValues = enumValues(property(intent, 'audience'));
  const supportValues = enumValues(node(SpatialSupportSchema));
  const measurementValues = enumValues(property(node(FieldSchema), 'measurement'));
  const semanticValues = enumValues(property(node(FieldSchema), 'semantic_type'));
  const normalizationValues = enumValues(property(node(FieldSchema), 'normalization'));
  const classificationValues = enumValues(property(color, 'classification'));
  const missingValues = enumValues(property(constraints, 'missing_data'));
  const basemapStyles = enumValues(property(basemap, 'style'));
  const contrastValues = enumValues(property(basemap, 'contrast'));
  const zoomTargets = enumValues(property(zoomRule, 'target'));
  const zoomActions = enumValues(property(zoomRule, 'action'));

  return `# Atlaspec 0.1 generation reference

Return exactly one YAML document. The first bytes must be \`version:\`; do not
add prose, backticks, a Markdown fence, or a \`---\` marker. Atlaspec rejects
unknown keys. Use only the keys and values listed below, even when another key
would seem reasonable.

## Exact object grammar

Key notation: \`*\` means required; all unmarked keys are optional.

- document: ${keyList(root)}
  - version: \`0.1\`
  - family: ${values(familyValues)}
- intent: ${keyList(intent)}
  - task: ${values(taskValues)}
  - audience: ${values(audienceValues)}
- data: ${keyList(property(root, 'data'))}
- each source, exactly one shape:
${sourceAlternatives.map((schema) => `  - ${keyList(schema)}; type: ${values(enumValues(property(schema, 'type')))}`).join('\n')}
- each field: ${keyList(node(FieldSchema))}
  - measurement: ${values(measurementValues)}
  - semantic_type: ${values(semanticValues)}
  - normalization: ${values(normalizationValues)}
  - range: exactly two numbers, for example \`[0, 1]\`
  - domain: array of unique strings, for example \`[clinic, shelter, depot]\`
- encoding: ${keyList(node(EncodingSchema))}
  - geometry object: ${keyList(property(node(EncodingSchema), 'geometry'))}
    - support: ${values(supportValues)}
  - color object: ${keyList(color)}
    - classification: ${values(classificationValues)}
  - size, category, label, and weight objects: \`field\` only
- constraints: ${keyList(constraints)}
  - missing_data: ${values(missingValues)}
  - raw_count_choropleth: \`reject\` or \`allow\`
  - protected_layers: array of strings; never a single string
  - label_priority: array of strings such as \`[name]\`; never a string or boolean
  - viewport object: ${keyList(property(constraints, 'viewport'))}
- behavior: ${keyList(behavior)}
  - each zoom rule: ${keyList(zoomRule)}
  - target: ${values(zoomTargets)}
  - action: ${values(zoomActions)}
- basemap: ${keyList(basemap)}
  - style: ${values(basemapStyles)}
  - contrast: ${values(contrastValues)}
- metadata: optional key/value object whose values may only be a string, number,
  or boolean. Do not put arrays or nested objects in metadata.

Do not put \`zoom\`, \`zoom_rules\`, or scale settings at the document root or
inside \`constraints\`. Semantic zoom belongs only at
\`behavior.zoom_rules\`. Do not add \`scale\`, \`range\`, or
\`classification\` under \`encoding.size\`; do not add \`palette\`, \`domain\`,
or \`missing\` under \`encoding.category\`; do not add \`classification\` under
\`encoding.weight\`. Those renderer decisions are compiler-derived.

## Family contracts

- \`choropleth\`: polygon geometry and \`color\` are required. The color field
  must be ordered. A raw count requires normalization or an explicit
  \`raw_count_choropleth: allow\` override.
- \`proportional-symbol\`: point geometry and \`size\` are required. The size
  field must be quantitative. Area-proportional scaling is compiler-derived;
  write only \`size: {field: ...}\`.
- \`categorical-point\`: point geometry and \`category\` are required. The
  category field must be nominal and declare its string \`domain\` on the field.
  The colorblind-safe palette is compiler-derived.
- \`heatmap\`: point or grid geometry is required. \`weight\` is optional; when
  present its field must be ordinal or quantitative. Kernel, radius, intensity,
  and palette are compiler-derived.

Probability fields are quantitative and stay within \`[0, 1]\`. Category and
label fields are nominal. Counts and capacities are quantitative, use
\`normalization: none\`, and have a nonnegative range.

## Complete choropleth example

\`\`\`yaml
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
\`\`\`

For proportional symbols replace the value field with a quantitative capacity
field and use \`family: proportional-symbol\`, point geometry, and
\`size: {field: capacity}\`. For categorical points declare a nominal category
field with \`semantic_type: category\` and \`domain: [clinic, shelter, depot]\`,
then use \`category: {field: category}\`. For a heatmap declare an ordinal or
quantitative severity field and use \`weight: {field: severity}\`.

There is no authored \`legend\` key. A legend request is satisfied by the
encoding field and its semantic type, unit, range, or domain. The compiler
derives MapLibre \`metadata["atlaspec:legend"]\`.
`;
}

export function renderAtlaspecV02Reference(): string {
  const root = node(AtlaspecV02Schema);
  const intent = property(root, 'intent');
  const layer = node(AtlaspecLayerSchema);
  const encoding = property(layer, 'encoding');
  const color = property(encoding, 'color');
  const layerConstraints = property(layer, 'constraints');
  const behavior = property(layer, 'behavior');
  const zoomRule = property(behavior, 'zoom_rules').items!;
  const globalConstraints = property(root, 'constraints');
  const basemap = property(root, 'basemap');
  const sourceAlternatives = node(DataSourceSchema).anyOf ?? [];

  return `# Atlaspec 0.2 generation reference

Return exactly one YAML document beginning with \`version:\`. Do not emit prose,
Markdown fences, backticks, headings, or a \`---\` marker. Unknown keys are
rejected. Atlaspec 0.2 represents one ordered map as an ordered \`layers\` array.

Key notation: \`*\` means required; all unmarked keys are optional.

- document: ${keyList(root)}
  - version: \`0.2\`
- intent: ${keyList(intent)}
  - task: ${values(enumValues(property(intent, 'task')))}
  - audience: ${values(enumValues(property(intent, 'audience')))}
- data: ${keyList(property(root, 'data'))}
- each source, exactly one shape:
${sourceAlternatives.map((schema) => `  - ${keyList(schema)}; type: ${values(enumValues(property(schema, 'type')))}`).join('\n')}
- each field: ${keyList(node(FieldSchema))}
  - measurement: ${values(enumValues(property(node(FieldSchema), 'measurement')))}
  - semantic_type: ${values(enumValues(property(node(FieldSchema), 'semantic_type')))}
  - normalization: ${values(enumValues(property(node(FieldSchema), 'normalization')))}
  - range is exactly two numbers; domain is an array of unique strings
- each layer: ${keyList(layer)}
  - purpose: ${values(enumValues(node(LayerPurposeSchema)))}
  - family: ${values(enumValues(node(MapFamilySchema)))}
  - encoding: ${keyList(encoding)}
  - geometry: ${keyList(property(encoding, 'geometry'))}
  - geometry support: ${values(enumValues(property(property(encoding, 'geometry'), 'support')))}
  - color: ${keyList(color)}
  - color classification: ${values(enumValues(property(color, 'classification')))}
  - size, category, label, and weight contain only \`field\`
  - constraints: ${keyList(layerConstraints)}
  - missing_data: ${values(enumValues(property(layerConstraints, 'missing_data')))}
  - behavior: ${keyList(behavior)}
  - each zoom rule: ${keyList(zoomRule)}
  - zoom target: ${values(enumValues(property(zoomRule, 'target')))}
  - zoom action: ${values(enumValues(property(zoomRule, 'action')))}
- global constraints: ${keyList(globalConstraints)}
  - viewport: ${keyList(property(globalConstraints, 'viewport'))}
  - protected_layers and label_priority are arrays of strings
- basemap: ${keyList(basemap)}
  - style: ${values(enumValues(property(basemap, 'style')))}
  - contrast: ${values(enumValues(property(basemap, 'contrast')))}
- metadata values may only be a string, number, or boolean. Do not put arrays
  or nested objects in metadata. Stress requirements describe evaluation
  context; do not copy them into metadata.

Every field reference in a layer must name a key in \`data.fields\`; that field's
\`source\` must match the layer geometry source. Keep layer IDs stable and keep
the authored layer order. Put \`missing_data\` and \`raw_count_choropleth\` on
the layer, while viewport and colorblind safety are global constraints. Put
semantic zoom only in the relevant layer's \`behavior.zoom_rules\`.
Do not invent zoom rules. Omit \`behavior\` unless the request explicitly gives
zoom thresholds and actions; a viewport or layer-visibility stress label alone
does not require a zoom rule.

Family requirements:

- choropleth: polygon geometry plus ordered color; raw counts need normalization
  or \`raw_count_choropleth: allow\`;
- proportional-symbol: point geometry plus quantitative size;
- categorical-point: point geometry plus nominal category with a string domain;
- heatmap: point or grid geometry and optional ordinal or quantitative weight.

There is no authored legend key. Legends, scales, palettes, symbol radii, and
heatmap kernels are compiler-derived from field semantics and encodings.

Complete two-layer shape:

\`\`\`yaml
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
\`\`\`
`;
}

const targets = [
  [resolve('benchmark', 'references', 'atlaspec.md'), renderAtlaspecReference()],
  [resolve('benchmark', 'references', 'atlaspec-v02.md'), renderAtlaspecV02Reference()],
] as const;
if (process.argv[1]?.endsWith('generate-atlaspec.ts')) {
  if (process.argv.includes('--check')) {
    for (const [target, expected] of targets) {
      const actual = await readFile(target, 'utf8');
      if (actual !== expected) {
        console.error(`Atlaspec generation reference is stale: ${target}`);
        process.exitCode = 1;
      } else {
        console.log(`VERIFIED Atlaspec generation reference: ${target}`);
      }
    }
  } else {
    for (const [target, expected] of targets) {
      await writeFile(target, expected, 'utf8');
      console.log(`WROTE ${target}`);
    }
  }
}

function node(value: unknown): SchemaNode {
  return value as SchemaNode;
}

function property(schema: SchemaNode, name: string): SchemaNode {
  const value = schema.properties?.[name];
  if (value === undefined) throw new Error(`Schema property is missing: ${name}`);
  return value;
}

function enumValues(schema: SchemaNode): unknown[] {
  const alternatives = schema.anyOf ?? [schema];
  const values = alternatives.flatMap((item) =>
    'const' in item ? [item.const] : [],
  );
  if (values.length === 0) throw new Error('Expected a literal union in Atlaspec schema.');
  return values;
}

function keyList(schema: SchemaNode): string {
  const required = new Set(schema.required ?? []);
  return Object.keys(schema.properties ?? {})
    .map((key) => `\`${key}${required.has(key) ? '*' : ''}\``)
    .join(', ');
}

function values(items: readonly unknown[]): string {
  return items.map((item) => `\`${String(item)}\``).join(', ');
}
