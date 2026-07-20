import type { MapLibreStyle } from '../../src/maplibre.js';
import type { SemanticMapRecord } from '../../src/semantic.js';
import type { VegaLiteSpec } from '../../src/vega-lite.js';

export type SemanticExtractionResult =
  | { ok: true; record: SemanticMapRecord }
  | { ok: false; diagnostics: string[] };

export interface SemanticComparison {
  equal: boolean;
  differences: string[];
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
