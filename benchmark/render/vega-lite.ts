import { createHash } from 'node:crypto';

import { View, parse as parseVega } from 'vega';
import { compile as compileVegaLite } from 'vega-lite';
import type { TopLevelSpec } from 'vega-lite';

import type { InputArtifact } from '../protocol.js';

export interface VegaLiteRenderCheck {
  code: string;
  passed: boolean;
  detail: string;
}

export interface VegaLiteRenderMetrics {
  requested_width: number | null;
  requested_height: number | null;
  rendered_width: number | null;
  rendered_height: number | null;
  resolved_data_urls: number;
  resolved_records: number;
  mark_containers: number;
  data_marks: number;
  geoshape_marks: number;
  circle_marks: number;
  text_marks: number;
  legend_groups: number;
  aria_labels: number;
  svg_bytes: number;
  svg_sha256: string;
}

export interface VegaLiteRenderResult {
  accepted: boolean;
  checks: VegaLiteRenderCheck[];
  metrics: VegaLiteRenderMetrics;
  warnings: string[];
  svg: string;
}

export async function renderVegaLiteSvg(
  spec: Record<string, unknown>,
  inputs: readonly InputArtifact[],
): Promise<VegaLiteRenderResult> {
  const hydrated = hydrateDataUrls(spec, inputs);
  const captured = captureConsoleWarnings(() =>
    compileVegaLite(hydrated.spec as unknown as TopLevelSpec),
  );
  const view = new View(parseVega(captured.value.spec), {
    renderer: 'none',
  });
  let svg: string;
  try {
    svg = await view.toSVG();
  } finally {
    view.finalize();
  }

  const renderedWidth = numericAttribute(svg, 'width');
  const renderedHeight = numericAttribute(svg, 'height');
  const geoshapeMarks = count(svg, /aria-roledescription="geoshape"/g);
  const circleMarks = count(svg, /aria-roledescription="circle"/g);
  const textMarks = count(svg, /aria-roledescription="text mark"/g);
  const dataMarks = geoshapeMarks + circleMarks + textMarks;
  const metrics: VegaLiteRenderMetrics = {
    requested_width: finiteNumber(hydrated.spec['width']),
    requested_height: finiteNumber(hydrated.spec['height']),
    rendered_width: renderedWidth,
    rendered_height: renderedHeight,
    resolved_data_urls: hydrated.resolvedUrls,
    resolved_records: hydrated.resolvedRecords,
    mark_containers: count(svg, /class="[^"]*\brole-mark\b[^"]*"/g),
    data_marks: dataMarks,
    geoshape_marks: geoshapeMarks,
    circle_marks: circleMarks,
    text_marks: textMarks,
    legend_groups: count(svg, /\brole-legend\b/g),
    aria_labels: count(svg, /\baria-label="/g),
    svg_bytes: Buffer.byteLength(svg),
    svg_sha256: sha256(svg),
  };
  const checks = [
    check(
      'render.data-resolved',
      hydrated.discoveredUrls === hydrated.resolvedUrls,
      `resolved=${hydrated.resolvedUrls} discovered=${hydrated.discoveredUrls} records=${hydrated.resolvedRecords}`,
    ),
    check(
      'render.svg-root',
      svg.startsWith('<svg ') && svg.endsWith('</svg>'),
      `bytes=${metrics.svg_bytes}`,
    ),
    check(
      'render.viewport-positive',
      renderedWidth !== null && renderedWidth > 0 && renderedHeight !== null && renderedHeight > 0,
      `width=${renderedWidth ?? 'missing'} height=${renderedHeight ?? 'missing'}`,
    ),
    check(
      'render.mark-containers',
      metrics.mark_containers > 0,
      `containers=${metrics.mark_containers}`,
    ),
    check(
      'render.data-marks',
      dataMarks > 0,
      `geoshape=${geoshapeMarks} circle=${circleMarks} text=${textMarks}`,
    ),
    check(
      'render.accessibility-labels',
      metrics.aria_labels >= dataMarks,
      `aria_labels=${metrics.aria_labels} data_marks=${dataMarks}`,
    ),
  ];

  return {
    accepted: checks.every((item) => item.passed),
    checks,
    metrics,
    warnings: captured.warnings,
    svg,
  };
}

interface HydratedSpec {
  spec: Record<string, unknown>;
  discoveredUrls: number;
  resolvedUrls: number;
  resolvedRecords: number;
}

function hydrateDataUrls(
  spec: Record<string, unknown>,
  inputs: readonly InputArtifact[],
): HydratedSpec {
  const hydrated = structuredClone(spec);
  const artifacts = new Map(
    inputs
      .filter((input) => input.role === 'data')
      .map((input) => [normalizePath(input.path), input]),
  );
  let discoveredUrls = 0;
  let resolvedUrls = 0;
  let resolvedRecords = 0;

  visit(hydrated, (value, key) => {
    if (key !== 'data') return;
    if (typeof value['url'] !== 'string') return;
    discoveredUrls += 1;
    const path = normalizePath(value['url']);
    const artifact = artifacts.get(path);
    if (artifact === undefined) {
      throw new Error(`No embedded benchmark input matches Vega-Lite data URL '${value['url']}'.`);
    }
    const parsed = JSON.parse(artifact.content) as unknown;
    const property = dataProperty(value['format']);
    const records = property === undefined ? parsed : readProperty(parsed, property);
    if (!Array.isArray(records)) {
      throw new Error(`Resolved Vega-Lite data URL '${value['url']}' is not an array.`);
    }
    delete value['url'];
    delete value['format'];
    value['values'] = records;
    resolvedUrls += 1;
    resolvedRecords += records.length;
  });

  return { spec: hydrated, discoveredUrls, resolvedUrls, resolvedRecords };
}

function visit(
  value: unknown,
  apply: (value: Record<string, unknown>, key: string | undefined) => void,
  key?: string,
): void {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, apply, key);
    return;
  }
  if (!isRecord(value)) return;
  apply(value, key);
  for (const [childKey, child] of Object.entries(value)) {
    if (childKey !== 'values') visit(child, apply, childKey);
  }
}

function dataProperty(format: unknown): string | undefined {
  return isRecord(format) && typeof format['property'] === 'string'
    ? format['property']
    : undefined;
}

function readProperty(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split('.')) {
    if (!isRecord(current) || !(segment in current)) {
      throw new Error(`Embedded benchmark input does not contain data property '${path}'.`);
    }
    current = current[segment];
  }
  return current;
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function numericAttribute(svg: string, name: string): number | null {
  const match = svg.match(new RegExp(`<svg\\b[^>]*\\b${name}="([0-9.]+)"`));
  return match?.[1] === undefined ? null : Number(match[1]);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function captureConsoleWarnings<T>(run: () => T): { value: T; warnings: string[] } {
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(' '));
  try {
    return { value: run(), warnings };
  } finally {
    console.warn = originalWarn;
  }
}

function check(code: string, passed: boolean, detail: string): VegaLiteRenderCheck {
  return { code, passed, detail };
}

function count(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
