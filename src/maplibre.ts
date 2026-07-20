import type { Diagnostic } from './diagnostics.js';
import type {
  AtlaspecLayer,
  AtlaspecV01Document,
  AtlaspecV02Document,
  DataSource,
  Field,
} from './schema.js';
import { buildSemanticRecord } from './semantic.js';
import { validateAtlaspec } from './validate.js';

export interface CompilationDecision {
  code: string;
  path: string;
  value: unknown;
  reason: string;
}

export interface MapLibreStyle {
  version: 8;
  name: string;
  glyphs: string;
  metadata: Record<string, unknown>;
  sources: Record<string, Record<string, unknown>>;
  layers: Array<Record<string, unknown>>;
}

export type CompilationResult =
  | {
      ok: true;
      style: MapLibreStyle;
      decisions: CompilationDecision[];
      diagnostics: Diagnostic[];
    }
  | {
      ok: false;
      diagnostics: Diagnostic[];
    };

const SEQUENTIAL_PALETTE = ['#440154', '#21918c', '#fde725'] as const;
const DIVERGING_PALETTE = ['#3b4cc0', '#f7f7f7', '#b40426'] as const;
const CATEGORICAL_PALETTE = [
  '#0072b2',
  '#e69f00',
  '#009e73',
  '#cc79a7',
  '#d55e00',
  '#56b4e9',
  '#f0e442',
  '#000000',
] as const;

export function compileMapLibre(value: unknown): CompilationResult {
  const validation = validateAtlaspec(value);
  if (!validation.valid) {
    return { ok: false, diagnostics: validation.diagnostics };
  }

  return (value as { version: '0.1' | '0.2' }).version === '0.1'
    ? compileMapLibreV01(
        value as AtlaspecV01Document,
        validation.diagnostics,
      )
    : compileMapLibreV02(
        value as AtlaspecV02Document,
        validation.diagnostics,
      );
}

function compileMapLibreV01(
  document: AtlaspecV01Document,
  diagnostics: Diagnostic[],
): CompilationResult {
  const decisions: CompilationDecision[] = [];
  const sources = compileSources(document, decisions);
  const layers = compileLayers(document, decisions);

  const style: MapLibreStyle = {
    version: 8,
    name: document.title,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    metadata: {
      'atlaspec:version': document.version,
      'atlaspec:map': document.map,
      'atlaspec:family': document.family,
      'atlaspec:intent': document.intent,
      'atlaspec:legend': compileLegend(document),
      'atlaspec:decisions': decisions,
    },
    sources,
    layers,
  };

  return {
    ok: true,
    style,
    decisions,
    diagnostics,
  };
}

function compileMapLibreV02(
  document: AtlaspecV02Document,
  diagnostics: Diagnostic[],
): CompilationResult {
  const decisions: CompilationDecision[] = [];
  const sources = compileSourcesV02(document, decisions);
  const layerDocuments = document.layers.map((layer) =>
    layerAsV01(document, layer),
  );
  const layers: Array<Record<string, unknown>> = [];
  const background = compileBackground(
    { ...layerDocuments[0]!, map: document.map },
    decisions,
  );
  if (background !== undefined) layers.push(background);

  const legends: Array<Record<string, unknown>> = [];
  for (const [index, layerDocument] of layerDocuments.entries()) {
    const decisionStart = decisions.length;
    layers.push(...compileThematicLayers(layerDocument, decisions, true));
    for (let decisionIndex = decisionStart; decisionIndex < decisions.length; decisionIndex += 1) {
      const decision = decisions[decisionIndex]!;
      decision.path = layerDecisionPath(index, decision.path);
    }

    const legend = compileLegend(layerDocument);
    if (legend !== undefined) {
      legends.push({
        layer_id: document.layers[index]!.id,
        purpose: document.layers[index]!.purpose,
        family: document.layers[index]!.family,
        missing_data: document.layers[index]!.constraints?.missing_data ?? null,
        ...legend,
      });
    }
  }

  traceGlobalConstraints(document, decisions);

  const style: MapLibreStyle = {
    version: 8,
    name: document.title,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    metadata: {
      'atlaspec:version': document.version,
      'atlaspec:map': document.map,
      'atlaspec:layers': document.layers.map((layer) => ({
        id: layer.id,
        purpose: layer.purpose,
        family: layer.family,
      })),
      'atlaspec:intent': document.intent,
      'atlaspec:semantic': buildSemanticRecord(document),
      'atlaspec:legend': legends,
      'atlaspec:decisions': decisions,
    },
    sources,
    layers,
  };

  return { ok: true, style, decisions, diagnostics };
}

function compileSourcesV02(
  document: AtlaspecV02Document,
  decisions: CompilationDecision[],
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};

  for (const source of document.data.sources) {
    const compiled = compileSource(source);
    const clusteredLayerIndex = document.layers.findIndex(
      (layer) =>
        layer.encoding.geometry.source === source.id &&
        hasClusterRule(layer),
    );
    if (clusteredLayerIndex >= 0) {
      const rule = document.layers[clusteredLayerIndex]!.behavior!.zoom_rules.find(
        (candidate) =>
          candidate.target === 'symbols' && candidate.action === 'cluster',
      )!;
      compiled['cluster'] = true;
      compiled['clusterMaxZoom'] = rule.max_zoom ?? 14;
      compiled['clusterRadius'] = 50;
      decisions.push({
        code: 'source.cluster-enabled',
        path: `/layers/${clusteredLayerIndex}/behavior/zoom_rules`,
        value: {
          source: source.id,
          maxZoom: compiled['clusterMaxZoom'],
          radius: compiled['clusterRadius'],
        },
        reason: 'A semantic zoom rule requested point clustering.',
      });
    }
    result[source.id] = compiled;
  }

  return result;
}

function layerAsV01(
  document: AtlaspecV02Document,
  layer: AtlaspecLayer,
): AtlaspecV01Document {
  const constraints = {
    ...layer.constraints,
    ...(document.constraints?.colorblind_safe === undefined
      ? {}
      : { colorblind_safe: document.constraints.colorblind_safe }),
    ...(document.constraints?.label_priority === undefined
      ? {}
      : { label_priority: document.constraints.label_priority }),
    ...(document.constraints?.viewport === undefined
      ? {}
      : { viewport: document.constraints.viewport }),
  };

  return {
    version: '0.1',
    map: `${document.map}-${layer.id}`,
    title: document.title,
    ...(document.description === undefined
      ? {}
      : { description: document.description }),
    family: layer.family,
    intent: document.intent,
    data: document.data,
    encoding: layer.encoding,
    ...(Object.keys(constraints).length === 0 ? {} : { constraints }),
    ...(layer.behavior === undefined ? {} : { behavior: layer.behavior }),
    ...(document.basemap === undefined ? {} : { basemap: document.basemap }),
    ...(document.metadata === undefined ? {} : { metadata: document.metadata }),
  };
}

function hasClusterRule(layer: AtlaspecLayer): boolean {
  return (layer.behavior?.zoom_rules ?? []).some(
    (rule) => rule.target === 'symbols' && rule.action === 'cluster',
  );
}

function layerDecisionPath(index: number, path: string): string {
  for (const root of ['/encoding', '/behavior', '/constraints']) {
    if (path === root || path.startsWith(`${root}/`)) {
      return `/layers/${index}${path}`;
    }
  }
  return path;
}

function traceGlobalConstraints(
  document: AtlaspecV02Document,
  decisions: CompilationDecision[],
): void {
  if (document.constraints?.protected_layers !== undefined) {
    decisions.push({
      code: 'constraints.protected-layers',
      path: '/constraints/protected_layers',
      value: document.constraints.protected_layers,
      reason: 'Authored semantic layer protection was retained in compiler metadata.',
    });
  }
  if (document.constraints?.label_priority !== undefined) {
    decisions.push({
      code: 'constraints.label-priority',
      path: '/constraints/label_priority',
      value: document.constraints.label_priority,
      reason: 'Authored label priority was retained in compiler metadata.',
    });
  }
  if (document.constraints?.allow_duplicate_labels === true) {
    decisions.push({
      code: 'constraints.duplicate-labels-allowed',
      path: '/constraints/allow_duplicate_labels',
      value: true,
      reason: 'The explicit duplicate-label opt-in was retained in compiler metadata.',
    });
  }
}

function compileSources(
  document: AtlaspecV01Document,
  decisions: CompilationDecision[],
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  const clusterRule = document.behavior?.zoom_rules.find(
    (rule) => rule.target === 'symbols' && rule.action === 'cluster',
  );

  for (const source of document.data.sources) {
    const compiled = compileSource(source);
    if (
      source.id === document.encoding.geometry.source &&
      clusterRule !== undefined
    ) {
      compiled['cluster'] = true;
      compiled['clusterMaxZoom'] = clusterRule.max_zoom ?? 14;
      compiled['clusterRadius'] = 50;
      decisions.push({
        code: 'source.cluster-enabled',
        path: `/sources/${source.id}`,
        value: {
          maxZoom: compiled['clusterMaxZoom'],
          radius: compiled['clusterRadius'],
        },
        reason: 'A semantic zoom rule requested point clustering.',
      });
    }
    result[source.id] = compiled;
  }

  return result;
}

function compileSource(source: DataSource): Record<string, unknown> {
  return {
    type: 'geojson',
    data: 'url' in source ? source.url : source.data,
  };
}

function compileLayers(
  document: AtlaspecV01Document,
  decisions: CompilationDecision[],
): Array<Record<string, unknown>> {
  const layers: Array<Record<string, unknown>> = [];
  const background = compileBackground(document, decisions);
  if (background !== undefined) {
    layers.push(background);
  }

  layers.push(...compileThematicLayers(document, decisions));

  return layers;
}

function compileThematicLayers(
  document: AtlaspecV01Document,
  decisions: CompilationDecision[],
  strictMissing = false,
): Array<Record<string, unknown>> {
  const layers: Array<Record<string, unknown>> = [];
  switch (document.family) {
    case 'choropleth':
      layers.push(...compileChoropleth(document, decisions, strictMissing));
      break;
    case 'proportional-symbol':
      layers.push(...compileProportionalSymbols(document, decisions, strictMissing));
      break;
    case 'categorical-point':
      layers.push(...compileCategoricalPoints(document, decisions, strictMissing));
      break;
    case 'heatmap':
      layers.push(...compileHeatmap(document, decisions, strictMissing));
      break;
  }

  return layers;
}

function compileBackground(
  document: AtlaspecV01Document,
  decisions: CompilationDecision[],
): Record<string, unknown> | undefined {
  const style = document.basemap?.style ?? 'minimal-light';
  if (style === 'none') {
    return undefined;
  }

  const color = style === 'minimal-dark' ? '#111827' : '#f8fafc';
  decisions.push({
    code: 'basemap.background-selected',
    path: '/basemap/style',
    value: color,
    reason: `Built-in ${style} basemap selected.`,
  });

  return {
    id: `${document.map}-background`,
    type: 'background',
    paint: { 'background-color': color },
  };
}

function compileChoropleth(
  document: AtlaspecV01Document,
  decisions: CompilationDecision[],
  strictMissing = false,
): Array<Record<string, unknown>> {
  const colorName = document.encoding.color!.field;
  const colorField = document.data.fields[colorName]!;
  const range = rangeFor(colorField, [0, 1]);
  const palette =
    colorField.semantic_type === 'delta'
      ? DIVERGING_PALETTE
      : SEQUENTIAL_PALETTE;
  const colorExpression = interpolateColor(
    colorField.path,
    range,
    palette,
    colorField.semantic_type === 'delta',
  );
  const explicitMissing = document.constraints?.missing_data === 'explicit';

  decisions.push({
    code: 'color.palette-inferred',
    path: '/encoding/color',
    value: [...palette],
    reason: `${colorField.semantic_type} semantics determine the default palette family.`,
  });
  decisions.push({
    code: 'color.domain-selected',
    path: `/data/fields/${colorName}/range`,
    value: range,
    reason: colorField.range === undefined ? 'Default semantic range used.' : 'Declared field range used.',
  });

  const layers: Array<Record<string, unknown>> = [
    applyZoomRules(document, 'fill', {
      id: `${document.map}-fill`,
      type: 'fill',
      source: document.encoding.geometry.source,
      ...optionalFilter(missingDataFilter(document, colorField.path, strictMissing)),
      paint: {
        'fill-color': explicitMissing
          ? [
              'case',
              strictMissing
                ? validValueExpression(colorField.path)
                : ['has', colorField.path],
              colorExpression,
              '#bdbdbd',
            ]
          : colorExpression,
        'fill-opacity': 0.82,
        'fill-outline-color': '#475569',
      },
    }),
  ];

  const labels = compileLabels(document, undefined, strictMissing);
  if (labels !== undefined) {
    layers.push(labels);
  }
  return layers;
}

function compileProportionalSymbols(
  document: AtlaspecV01Document,
  decisions: CompilationDecision[],
  strictMissing = false,
): Array<Record<string, unknown>> {
  const sizeName = document.encoding.size!.field;
  const sizeField = document.data.fields[sizeName]!;
  const range = rangeFor(sizeField, [0, 1]);
  const sqrtMin = Math.sqrt(Math.max(0, range[0]));
  const sqrtMax = Math.sqrt(Math.max(range[1], range[0] + 1));
  const clustered = document.behavior?.zoom_rules.some(
    (rule) => rule.target === 'symbols' && rule.action === 'cluster',
  );
  const explicitMissing = document.constraints?.missing_data === 'explicit';
  const radiusExpression: unknown[] = [
    'interpolate',
    ['linear'],
    ['sqrt', ['max', 0, ['to-number', ['get', sizeField.path]]]],
    sqrtMin,
    4,
    sqrtMax,
    28,
  ];

  decisions.push({
    code: 'size.area-proportional-scale',
    path: '/encoding/size',
    value: { domain: range, radius: [4, 28] },
    reason: 'Circle radius uses the square root of the quantitative value so area remains proportional.',
  });

  const symbolLayer = applyZoomRules(document, 'symbols', {
    id: `${document.map}-symbols`,
    type: 'circle',
    source: document.encoding.geometry.source,
    ...optionalFilter(
      combineFilters(
        clustered ? ['!', ['has', 'point_count']] : undefined,
        missingDataFilter(document, sizeField.path, strictMissing),
      ),
    ),
    paint: {
      'circle-radius':
        strictMissing && explicitMissing
          ? ['case', validValueExpression(sizeField.path), radiusExpression, 6]
          : radiusExpression,
      'circle-color':
        strictMissing && explicitMissing
          ? ['case', validValueExpression(sizeField.path), '#0072b2', '#9ca3af']
          : '#0072b2',
      'circle-opacity': 0.78,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
  });

  const layers: Array<Record<string, unknown>> = [];
  if (clustered) {
    layers.push(
      {
        id: `${document.map}-clusters`,
        type: 'circle',
        source: document.encoding.geometry.source,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#0072b2',
          'circle-opacity': 0.82,
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            16,
            10,
            22,
            50,
            30,
          ],
        },
      },
      {
        id: `${document.map}-cluster-count`,
        type: 'symbol',
        source: document.encoding.geometry.source,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
        },
        paint: { 'text-color': '#ffffff' },
      },
    );
  }
  layers.push(symbolLayer);

  const labels = compileLabels(
    document,
    clustered ? ['!', ['has', 'point_count']] : undefined,
    strictMissing,
  );
  if (labels !== undefined) {
    layers.push(labels);
  }
  return layers;
}

function compileCategoricalPoints(
  document: AtlaspecV01Document,
  decisions: CompilationDecision[],
  strictMissing = false,
): Array<Record<string, unknown>> {
  const categoryName = document.encoding.category!.field;
  const categoryField = document.data.fields[categoryName]!;
  const domain = categoryField.domain!;
  const matches: unknown[] = ['match', ['get', categoryField.path]];

  for (const [index, value] of domain.entries()) {
    matches.push(value, CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length]);
  }
  matches.push('#9ca3af');

  decisions.push({
    code: 'color.categorical-domain',
    path: `/data/fields/${categoryName}/domain`,
    value: Object.fromEntries(
      domain.map((value, index) => [
        value,
        CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length],
      ]),
    ),
    reason: 'Declared nominal domain mapped to a deterministic color-vision-deficiency-aware palette.',
  });

  const layers: Array<Record<string, unknown>> = [
    applyZoomRules(document, 'symbols', {
      id: `${document.map}-symbols`,
      type: 'circle',
      source: document.encoding.geometry.source,
      ...optionalFilter(
        missingDataFilter(document, categoryField.path, strictMissing),
      ),
      paint: {
        'circle-radius': 7,
        'circle-color':
          strictMissing && document.constraints?.missing_data === 'explicit'
            ? ['case', validValueExpression(categoryField.path), matches, '#9ca3af']
            : matches,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
    }),
  ];
  const labels = compileLabels(document, undefined, strictMissing);
  if (labels !== undefined) {
    layers.push(labels);
  }
  return layers;
}

function compileHeatmap(
  document: AtlaspecV01Document,
  decisions: CompilationDecision[],
  strictMissing = false,
): Array<Record<string, unknown>> {
  const weightName = document.encoding.weight?.field;
  const weightField = weightName === undefined ? undefined : document.data.fields[weightName];
  const weightRange = weightField === undefined ? [0, 1] : rangeFor(weightField, [0, 1]);

  decisions.push({
    code: 'heatmap.kernel-defaults',
    path: '/encoding',
    value: { radius: [12, 28], intensity: [0.7, 1.4] },
    reason: 'Version 0.1 uses viewport-stable heatmap defaults with zoom interpolation.',
  });

  const heatmap = applyZoomRules(document, 'heatmap', {
      id: `${document.map}-heatmap`,
      type: 'heatmap',
      source: document.encoding.geometry.source,
      ...optionalFilter(
        weightField === undefined
          ? undefined
          : missingDataFilter(document, weightField.path, strictMissing),
      ),
      maxzoom: 18,
      paint: {
        'heatmap-weight':
          weightField === undefined
            ? 1
            : [
                'interpolate',
                ['linear'],
                ['to-number', ['get', weightField.path]],
                weightRange[0],
                0,
                weightRange[1],
                1,
              ],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.7, 14, 1.4],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 12, 14, 28],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.85, 18, 0.25],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(68,1,84,0)',
          0.35,
          '#3b528b',
          0.65,
          '#21918c',
          1,
          '#fde725',
        ],
      },
    });
  if (
    strictMissing &&
    weightField !== undefined &&
    document.constraints?.missing_data === 'explicit'
  ) {
    return [
      heatmap,
      applyZoomRules(document, 'heatmap', {
        id: `${document.map}-missing`,
        type: 'circle',
        source: document.encoding.geometry.source,
        filter: ['!', validValueExpression(weightField.path)],
        paint: {
          'circle-radius': 5,
          'circle-color': '#9ca3af',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      }),
    ];
  }
  return [heatmap];
}

function compileLabels(
  document: AtlaspecV01Document,
  filter?: unknown,
  strictMissing = false,
): Record<string, unknown> | undefined {
  const labelName = document.encoding.label?.field;
  if (labelName === undefined) {
    return undefined;
  }
  const labelField = document.data.fields[labelName]!;
  const encodedField = primaryEncodedField(document);
  return applyZoomRules(document, 'labels', {
    id: `${document.map}-labels`,
    type: 'symbol',
    source: document.encoding.geometry.source,
    ...optionalFilter(
      combineFilters(
        filter,
        encodedField === undefined
          ? undefined
          : missingDataFilter(document, encodedField.path, strictMissing),
      ),
    ),
    layout: {
      'text-field': ['get', labelField.path],
      'text-size': 12,
      'text-offset': [0, 1.2],
      'text-anchor': 'top',
      'text-allow-overlap': false,
      'text-ignore-placement': false,
    },
    paint: {
      'text-color': document.basemap?.style === 'minimal-dark' ? '#f8fafc' : '#111827',
      'text-halo-color': document.basemap?.style === 'minimal-dark' ? '#111827' : '#ffffff',
      'text-halo-width': 1.25,
    },
  });
}

function primaryEncodedField(document: AtlaspecV01Document): Field | undefined {
  const name =
    document.encoding.color?.field ??
    document.encoding.size?.field ??
    document.encoding.category?.field ??
    document.encoding.weight?.field;
  return name === undefined ? undefined : document.data.fields[name];
}

function missingDataFilter(
  document: AtlaspecV01Document,
  path: string,
  strictMissing: boolean,
): unknown[] | undefined {
  return document.constraints?.missing_data === 'hide'
    ? strictMissing
      ? validValueExpression(path)
      : ['has', path]
    : undefined;
}

function validValueExpression(path: string): unknown[] {
  return ['all', ['has', path], ['!=', ['get', path], null]];
}

function combineFilters(
  ...filters: Array<unknown | undefined>
): unknown | undefined {
  const active = filters.filter((filter) => filter !== undefined);
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];
  return ['all', ...active];
}

function optionalFilter(filter: unknown | undefined): Record<string, unknown> {
  return filter === undefined ? {} : { filter };
}

function applyZoomRules(
  document: AtlaspecV01Document,
  target: 'fill' | 'symbols' | 'labels' | 'heatmap',
  layer: Record<string, unknown>,
): Record<string, unknown> {
  for (const rule of document.behavior?.zoom_rules ?? []) {
    if (rule.target !== target || rule.action === 'cluster') {
      continue;
    }
    if (rule.action === 'show' || rule.action === 'show-labels') {
      if (rule.min_zoom !== undefined) layer['minzoom'] = rule.min_zoom;
      if (rule.max_zoom !== undefined) layer['maxzoom'] = rule.max_zoom;
    }
    if (rule.action === 'hide') {
      if (rule.min_zoom !== undefined) layer['maxzoom'] = rule.min_zoom;
      if (rule.max_zoom !== undefined) layer['minzoom'] = rule.max_zoom;
    }
  }
  return layer;
}

function rangeFor(field: Field, fallback: readonly [number, number]): [number, number] {
  return field.range === undefined ? [fallback[0], fallback[1]] : [field.range[0], field.range[1]];
}

function interpolateColor(
  path: string,
  range: [number, number],
  palette: readonly [string, string, string],
  diverging: boolean,
): unknown[] {
  const midpoint = diverging ? 0 : range[0] + (range[1] - range[0]) / 2;
  return [
    'interpolate',
    ['linear'],
    ['to-number', ['get', path]],
    range[0],
    palette[0],
    midpoint,
    palette[1],
    range[1],
    palette[2],
  ];
}

function compileLegend(document: AtlaspecV01Document): Record<string, unknown> | undefined {
  const encoding = document.encoding.color ?? document.encoding.category ?? document.encoding.size;
  if (encoding === undefined) return undefined;
  const field = document.data.fields[encoding.field];
  if (field === undefined) return undefined;
  return {
    field: encoding.field,
    path: field.path,
    semantic_type: field.semantic_type,
    unit: field.unit ?? null,
    range: field.range ?? null,
    domain: field.domain ?? null,
  };
}
