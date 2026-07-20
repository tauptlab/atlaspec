import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  AtlaspecSchema,
  DataSourceSchema,
  EncodingSchema,
  FieldSchema,
  MapFamilySchema,
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
  const root = node(AtlaspecSchema);
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

const target = resolve('benchmark', 'references', 'atlaspec.md');
if (process.argv[1]?.endsWith('generate-atlaspec.ts')) {
  const expected = renderAtlaspecReference();
  if (process.argv.includes('--check')) {
    const actual = await readFile(target, 'utf8');
    if (actual !== expected) {
      console.error('Atlaspec generation reference is stale.');
      process.exitCode = 1;
    } else {
      console.log('VERIFIED Atlaspec generation reference');
    }
  } else {
    await writeFile(target, expected, 'utf8');
    console.log(`WROTE ${target}`);
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
