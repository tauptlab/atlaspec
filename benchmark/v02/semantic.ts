import type { MapLibreStyle } from '../../src/maplibre.js';
import type { SemanticMapRecord } from '../../src/semantic.js';
import type { VegaLiteSpec } from '../../src/vega-lite.js';
import type { V02LayerRequirement, V02ManifestTask } from './manifest.js';

export type SemanticExtractionResult =
  | { ok: true; record: SemanticMapRecord }
  | { ok: false; diagnostics: string[] };

export interface SemanticComparison {
  equal: boolean;
  differences: string[];
}

export interface DirectSemanticCheck {
  accepted: boolean;
  diagnostics: string[];
}

export function validateDirectMapLibreSemantics(
  style: MapLibreStyle,
  task: V02ManifestTask,
): DirectSemanticCheck {
  const diagnostics: string[] = [];
  const order: number[] = [];
  for (const requirement of task.layers) {
    const source = style.sources[requirement.source];
    if (source === undefined) {
      diagnostics.push(`maplibre.source-missing ${requirement.source}`);
    } else if (!sourceUrlMatches(source['data'], requirement.source_file)) {
      diagnostics.push(`maplibre.source-data-mismatch ${requirement.source}`);
    }
    const matching = style.layers
      .map((layer, index) => ({ layer, index }))
      .filter(
        ({ layer }) =>
          layer['source'] === requirement.source &&
          requirement.maplibre_types.includes(String(layer['type'])),
      );
    for (const type of requirement.maplibre_types) {
      if (!matching.some(({ layer }) => layer['type'] === type)) {
        diagnostics.push(`maplibre.role-missing ${requirement.id}/${type}`);
      }
    }
    const thematicType = maplibreThematicType(requirement);
    const thematic = matching.find(({ layer }) => layer['type'] === thematicType);
    if (thematic !== undefined) order.push(thematic.index);
    for (const binding of requirement.bindings) {
      const roleType = maplibreBindingType(binding.channel, requirement.family);
      const candidates = matching.filter(({ layer }) => layer['type'] === roleType);
      if (!candidates.some(({ layer }) => containsString(layer, binding.path))) {
        diagnostics.push(
          `maplibre.binding-missing ${requirement.id}/${binding.channel}/${binding.path}`,
        );
      }
    }
  }
  const capability = task.capability_requirement;
  if (capability?.kind === 'unsupported-behavior') {
    const layer = task.layers.find((candidate) => candidate.id === capability.layer_id);
    const source = layer === undefined ? undefined : style.sources[layer.source];
    if (
      source?.['cluster'] !== true ||
      source['clusterMaxZoom'] !== capability.max_zoom
    ) {
      diagnostics.push(
        `maplibre.behavior-missing ${capability.layer_id}/cluster/${capability.max_zoom}`,
      );
    }
  }
  if (!strictlyIncreasing(order) || order.length !== task.layers.length) {
    diagnostics.push('maplibre.layer-order');
  }
  return { accepted: diagnostics.length === 0, diagnostics: diagnostics.sort() };
}

export function validateDirectVegaLiteSemantics(
  spec: VegaLiteSpec,
  task: V02ManifestTask,
): DirectSemanticCheck {
  const diagnostics: string[] = [];
  const units = Array.isArray(spec['layer'])
    ? spec['layer'].map((value, index) => ({ value: asRecord(value), index }))
    : [];
  const order: number[] = [];
  for (const requirement of task.layers) {
    const matching = units.filter(({ value }) =>
      value === undefined
        ? false
        : dataMatches(value['data'], requirement.source_file),
    );
    for (const mark of requirement.vega_marks) {
      if (!matching.some(({ value }) => markType(value?.['mark']) === mark)) {
        diagnostics.push(`vega-lite.role-missing ${requirement.id}/${mark}`);
      }
    }
    const thematicMark = vegaThematicMark(requirement);
    const thematic = matching.find(
      ({ value }) => markType(value?.['mark']) === thematicMark,
    );
    if (thematic !== undefined) order.push(thematic.index);
    for (const binding of requirement.bindings) {
      const mark = vegaBindingMark(binding.channel, requirement.family);
      const candidates = matching.filter(
        ({ value }) => markType(value?.['mark']) === mark,
      );
      if (!candidates.some(({ value }) => containsString(value, binding.path))) {
        diagnostics.push(
          `vega-lite.binding-missing ${requirement.id}/${binding.channel}/${binding.path}`,
        );
      }
    }
  }
  if (!strictlyIncreasing(order) || order.length !== task.layers.length) {
    diagnostics.push('vega-lite.layer-order');
  }
  return { accepted: diagnostics.length === 0, diagnostics: diagnostics.sort() };
}

export function extractMapLibreSemantics(
  style: MapLibreStyle,
): SemanticExtractionResult {
  const record = style.metadata['atlaspec:semantic'];
  if (!isSemanticRecord(record)) {
    return { ok: false, diagnostics: ['maplibre.semantic-record-missing'] };
  }
  const ids = new Set(style.layers.map((layer) => String(layer['id'])));
  const missing = record.layers
    .filter(
      (layer) =>
        ![...ids].some((id) => id.startsWith(`${record.map}-${layer.id}-`)),
    )
    .map((layer) => `maplibre.layer-missing ${layer.id}`);
  return missing.length === 0
    ? { ok: true, record }
    : { ok: false, diagnostics: missing };
}

export function extractVegaLiteSemantics(
  spec: VegaLiteSpec,
): SemanticExtractionResult {
  const atlaspec = asRecord(asRecord(spec['usermeta'])?.['atlaspec']);
  const record = atlaspec?.['semantic'];
  if (!isSemanticRecord(record)) {
    return { ok: false, diagnostics: ['vega-lite.semantic-record-missing'] };
  }
  const names = new Set(
    Array.isArray(spec['layer'])
      ? spec['layer']
          .map((layer) => asRecord(layer)?.['name'])
          .filter((name): name is string => typeof name === 'string')
      : [],
  );
  const missing = record.layers
    .filter(
      (layer) =>
        ![...names].some((name) =>
          name.startsWith(`${record.map}-${layer.id}-`),
        ),
    )
    .map((layer) => `vega-lite.layer-missing ${layer.id}`);
  return missing.length === 0
    ? { ok: true, record }
    : { ok: false, diagnostics: missing };
}

export function compareSemanticRecords(
  expected: SemanticMapRecord,
  actual: SemanticMapRecord,
): SemanticComparison {
  const differences: string[] = [];
  compareValue(expected, actual, '', differences);
  return { equal: differences.length === 0, differences };
}

export function compareUntargetedLayers(
  before: SemanticMapRecord,
  after: SemanticMapRecord,
  targetLayerId: string,
): SemanticComparison {
  const beforeLayers = before.layers.filter((layer) => layer.id !== targetLayerId);
  const afterLayers = after.layers.filter((layer) => layer.id !== targetLayerId);
  const differences: string[] = [];
  compareValue(beforeLayers, afterLayers, '/layers', differences);
  return { equal: differences.length === 0, differences };
}

function compareValue(
  expected: unknown,
  actual: unknown,
  path: string,
  differences: string[],
): void {
  if (Object.is(expected, actual)) return;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      differences.push(`${path || '/'} length expected=${expected.length} actual=${actual.length}`);
    }
    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index += 1) {
      compareValue(expected[index], actual[index], `${path}/${index}`, differences);
    }
    return;
  }
  const expectedRecord = asRecord(expected);
  const actualRecord = asRecord(actual);
  if (expectedRecord !== undefined && actualRecord !== undefined) {
    const keys = new Set([
      ...Object.keys(expectedRecord),
      ...Object.keys(actualRecord),
    ]);
    for (const key of [...keys].sort()) {
      compareValue(
        expectedRecord[key],
        actualRecord[key],
        `${path}/${escapePointer(key)}`,
        differences,
      );
    }
    return;
  }
  differences.push(
    `${path || '/'} expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`,
  );
}

function isSemanticRecord(value: unknown): value is SemanticMapRecord {
  const record = asRecord(value);
  return (
    record?.['version'] === '0.2' &&
    typeof record['map'] === 'string' &&
    Array.isArray(record['layers'])
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function maplibreThematicType(requirement: V02LayerRequirement): string {
  return requirement.family === 'choropleth'
    ? 'fill'
    : requirement.family === 'heatmap'
      ? 'heatmap'
      : 'circle';
}

function maplibreBindingType(
  channel: V02LayerRequirement['bindings'][number]['channel'],
  family: V02LayerRequirement['family'],
): string {
  if (channel === 'label') return 'symbol';
  return family === 'choropleth'
    ? 'fill'
    : family === 'heatmap'
      ? 'heatmap'
      : 'circle';
}

function vegaThematicMark(requirement: V02LayerRequirement): string {
  return requirement.family === 'choropleth'
    ? 'geoshape'
    : requirement.family === 'heatmap'
      ? 'rect'
      : 'circle';
}

function vegaBindingMark(
  channel: V02LayerRequirement['bindings'][number]['channel'],
  family: V02LayerRequirement['family'],
): string {
  if (channel === 'label') return 'text';
  return family === 'choropleth'
    ? 'geoshape'
    : family === 'heatmap'
      ? 'rect'
      : 'circle';
}

function markType(mark: unknown): string | undefined {
  if (typeof mark === 'string') return mark;
  return typeof asRecord(mark)?.['type'] === 'string'
    ? (asRecord(mark)!['type'] as string)
    : undefined;
}

function dataMatches(data: unknown, sourceFile: string): boolean {
  const record = asRecord(data);
  if (record === undefined) return false;
  return sourceUrlMatches(record['url'], sourceFile);
}

function sourceUrlMatches(value: unknown, sourceFile: string): boolean {
  return (
    typeof value === 'string' &&
    (value === sourceFile || value.endsWith(sourceFile.replaceAll('\\', '/')))
  );
}

function containsString(value: unknown, expected: string): boolean {
  if (typeof value === 'string') {
    return value === expected || value.endsWith(`.${expected}`) || value.includes(expected);
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsString(item, expected));
  }
  const record = asRecord(value);
  return record === undefined
    ? false
    : Object.values(record).some((item) => containsString(item, expected));
}

function strictlyIncreasing(values: number[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! < value);
}
