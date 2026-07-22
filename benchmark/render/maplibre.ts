import { createHash } from 'node:crypto';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { chromium, type Browser } from 'playwright-core';

import type { MapLibreStyle } from '../../src/maplibre.js';
import type { InputArtifact } from '../protocol.js';

const require = createRequire(import.meta.url);
const maplibreScript = require.resolve('maplibre-gl');
const maplibreCss = join(dirname(maplibreScript), 'maplibre-gl.css');

export interface MapLibreRenderCheck {
  code: string;
  passed: boolean;
  detail: string;
}

export interface MapLibreLayerMetric {
  id: string;
  type: string;
  rendered_features: number;
}

export interface MapLibreLabelLayerMetric {
  id: string;
  source: string | null;
  text_field: string | null;
  candidate_labels: number | null;
  rendered_labels: number;
  unique_rendered_labels: number | null;
  duplicate_rendered_labels: number | null;
  coverage: number | null;
}

export interface MapLibreRenderMetrics {
  requested_width: number;
  requested_height: number;
  browser_version: string;
  resolved_data_urls: number;
  resolved_features: number;
  loaded_sources: number;
  total_sources: number;
  rendered_features: number;
  geometry_layers: MapLibreLayerMetric[];
  symbol_layers: string[];
  label_layers: MapLibreLabelLayerMetric[];
  candidate_labels: number;
  rendered_labels: number;
  label_coverage: number | null;
  label_pixels: number;
  edge_label_pixels: number;
  edge_label_ratio: number | null;
  sampled_pixels: number;
  non_background_pixels: number;
  non_background_ratio: number;
  color_buckets: number;
  png_bytes: number;
  png_sha256: string;
}

export interface MapLibreRenderResult {
  accepted: boolean;
  checks: MapLibreRenderCheck[];
  metrics: MapLibreRenderMetrics;
  warnings: string[];
  png: Buffer;
}

export interface MapLibreRenderOptions {
  browser_path?: string;
  width?: number;
  height?: number;
  timeout_ms?: number;
}

interface MapLibreRenderInternalOptions extends MapLibreRenderOptions {
  browser_instance?: Browser;
}

export interface MapLibreRenderSession {
  browser_version: string;
  render(
    style: MapLibreStyle,
    inputs: readonly InputArtifact[],
  ): Promise<MapLibreRenderResult>;
  close(): Promise<void>;
}

export async function createMapLibreRenderSession(
  options: MapLibreRenderOptions = {},
): Promise<MapLibreRenderSession> {
  const browserPath = await resolveBrowserPath(options.browser_path);
  const browser = await launchBrowser(browserPath);
  return {
    browser_version: browser.version(),
    render: (style, inputs) =>
      renderMapLibrePng(style, inputs, {
        ...options,
        browser_instance: browser,
      }),
    close: () => browser.close(),
  };
}

export async function renderMapLibrePng(
  style: MapLibreStyle,
  inputs: readonly InputArtifact[],
  options: MapLibreRenderInternalOptions = {},
): Promise<MapLibreRenderResult> {
  const width = options.width ?? 960;
  const height = options.height ?? 640;
  const timeout = options.timeout_ms ?? 20_000;
  const hydrated = hydrateMapLibreStyle(style, inputs);
  const bounds = geoBounds(inputs);
  const ownsBrowser = options.browser_instance === undefined;
  const browser =
    options.browser_instance ??
    (await launchBrowser(await resolveBrowserPath(options.browser_path)));
  const warnings: string[] = [];

  try {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      offline: true,
    });
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') {
        warnings.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => warnings.push(`pageerror: ${error.message}`));
    await page.setContent('<!doctype html><html><head></head><body><div id="map"></div></body></html>');
    await page.addStyleTag({ path: maplibreCss });
    await page.addStyleTag({
      content:
        'html,body,#map{width:100%;height:100%;margin:0;padding:0;overflow:hidden} body{background:#fff}',
    });
    await page.addScriptTag({ path: maplibreScript });

    const browserMetrics = await page.evaluate(
      async ({ styleValue, fitBounds, timeoutMs }) => {
        interface MapErrorEvent {
          error?: { message?: string };
        }
        interface BrowserMap {
          once(event: string, listener: () => void): void;
          on(event: string, listener: (event: MapErrorEvent) => void): void;
          fitBounds(
            bounds: [[number, number], [number, number]],
            options: Record<string, unknown>,
          ): void;
          isSourceLoaded(id: string): boolean;
          queryRenderedFeatures(
            geometry?: undefined,
            options?: { layers: string[] },
          ): unknown[];
          getCanvas(): HTMLCanvasElement;
          getLayoutProperty(layerId: string, name: string): unknown;
          setLayoutProperty(layerId: string, name: string, value: unknown): void;
        }
        interface MapLibreGlobal {
          Map: new (options: Record<string, unknown>) => BrowserMap;
        }
        const maplibregl = (globalThis as unknown as { maplibregl: MapLibreGlobal }).maplibregl;
        const runtimeErrors: string[] = [];
        const map = new maplibregl.Map({
          container: 'map',
          style: styleValue,
          center: [0, 0],
          zoom: 0,
          interactive: false,
          attributionControl: false,
          preserveDrawingBuffer: true,
          fadeDuration: 0,
          renderWorldCopies: true,
          localIdeographFontFamily: 'sans-serif',
        });
        map.on('error', (event) => {
          runtimeErrors.push(event.error?.message ?? 'unknown MapLibre error');
        });

        await new Promise<void>((resolvePromise, reject) => {
          const timer = setTimeout(
            () => reject(new Error(`MapLibre did not load and become idle within ${timeoutMs} ms.`)),
            timeoutMs,
          );
          map.once('load', () => {
            map.fitBounds(fitBounds, { padding: 48, duration: 0, maxZoom: 14 });
            map.once('idle', () => {
              clearTimeout(timer);
              resolvePromise();
            });
          });
        });

        const sources = Object.keys(styleValue.sources);
        const geometryLayers = styleValue.layers.filter(
          (layer) => layer['type'] !== 'background' && layer['type'] !== 'symbol',
        );
        const symbolLayers = styleValue.layers.filter(
          (layer) => layer['type'] === 'symbol' && hasTextField(layer['layout']),
        );
        const layerMetrics = geometryLayers.map((layer) => ({
          id: String(layer['id']),
          type: String(layer['type']),
          rendered_features: map.queryRenderedFeatures(undefined, {
            layers: [String(layer['id'])],
          }).length,
        }));
        const canvas = map.getCanvas();
        const labelMetrics = symbolLayers.map((layer) => {
          const id = String(layer['id']);
          const sourceId = typeof layer['source'] === 'string' ? layer['source'] : null;
          const field = textField(layer['layout']);
          const source = sourceId === null ? undefined : styleValue.sources[sourceId];
          const data = source?.['data'];
          const features = isObject(data) && Array.isArray(data['features'])
            ? data['features']
            : null;
          const rawCandidateValues =
            field === null || features === null
              ? null
              : features
                  .map((feature) =>
                    isObject(feature) && isObject(feature['properties'])
                      ? feature['properties'][field]
                      : undefined,
                  )
                  .filter((value) => value !== null && value !== undefined)
                  .map(String);
          const rendered = map.queryRenderedFeatures(undefined, { layers: [id] });
          const candidateValues =
            field?.startsWith('point_count') === true ? null : rawCandidateValues;
          const renderedValues =
            field === null
              ? null
              : rendered
                  .map((feature) =>
                    isObject(feature) && isObject(feature['properties'])
                      ? feature['properties'][field]
                      : undefined,
                  )
                  .filter((value) => value !== null && value !== undefined)
                  .map(String);
          const uniqueRendered =
            renderedValues === null ? null : new Set(renderedValues).size;
          return {
            id,
            source: sourceId,
            text_field: field,
            candidate_labels: candidateValues?.length ?? null,
            rendered_labels: rendered.length,
            unique_rendered_labels: uniqueRendered,
            duplicate_rendered_labels:
              uniqueRendered === null ? null : rendered.length - uniqueRendered,
            coverage:
              candidateValues === null || candidateValues.length === 0
                ? null
                : rendered.length / candidateValues.length,
          };
        });
        const sample = document.createElement('canvas');
        sample.width = Math.min(240, canvas.width);
        sample.height = Math.min(160, canvas.height);
        const context = sample.getContext('2d', { willReadFrequently: true });
        if (context === null) throw new Error('Could not create a 2D sampling context.');
        context.drawImage(canvas, 0, 0, sample.width, sample.height);
        const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
        const buckets = new Map<string, number>();
        for (let index = 0; index < pixels.length; index += 4) {
          const key = `${pixels[index]! >> 4},${pixels[index + 1]! >> 4},${pixels[index + 2]! >> 4},${pixels[index + 3]! >> 4}`;
          buckets.set(key, (buckets.get(key) ?? 0) + 1);
        }
        const sampledPixels = pixels.length / 4;
        const dominantPixels = Math.max(...buckets.values());
        const fullPixels = context.getImageData(0, 0, sample.width, sample.height).data;
        const originalVisibility = symbolLayers.map((layer) => ({
          id: String(layer['id']),
          visibility: map.getLayoutProperty(String(layer['id']), 'visibility'),
        }));
        if (symbolLayers.length > 0) {
          const idle = new Promise<void>((resolveIdle) => map.once('idle', resolveIdle));
          for (const layer of symbolLayers) {
            map.setLayoutProperty(String(layer['id']), 'visibility', 'none');
          }
          await idle;
        }
        context.clearRect(0, 0, sample.width, sample.height);
        context.drawImage(canvas, 0, 0, sample.width, sample.height);
        const geometryPixels = context.getImageData(0, 0, sample.width, sample.height).data;
        let labelPixels = 0;
        let edgeLabelPixels = 0;
        const edge = 4;
        for (let index = 0; index < fullPixels.length; index += 4) {
          const difference =
            Math.abs(fullPixels[index]! - geometryPixels[index]!) +
            Math.abs(fullPixels[index + 1]! - geometryPixels[index + 1]!) +
            Math.abs(fullPixels[index + 2]! - geometryPixels[index + 2]!);
          if (difference < 24) continue;
          labelPixels += 1;
          const pixel = index / 4;
          const x = pixel % sample.width;
          const y = Math.floor(pixel / sample.width);
          if (x < edge || x >= sample.width - edge || y < edge || y >= sample.height - edge) {
            edgeLabelPixels += 1;
          }
        }
        if (symbolLayers.length > 0) {
          const idle = new Promise<void>((resolveIdle) => map.once('idle', resolveIdle));
          for (const layer of originalVisibility) {
            map.setLayoutProperty(layer.id, 'visibility', layer.visibility ?? 'visible');
          }
          await idle;
        }
        const result = {
          loadedSources: sources.filter((source) => map.isSourceLoaded(source)).length,
          totalSources: sources.length,
          renderedFeatures: layerMetrics.reduce(
            (total, layer) => total + layer.rendered_features,
            0,
          ),
          layerMetrics,
          labelMetrics,
          labelPixels,
          edgeLabelPixels,
          sampledPixels,
          nonBackgroundPixels: sampledPixels - dominantPixels,
          colorBuckets: buckets.size,
          runtimeErrors,
        };
        return result;

        function textField(layout: unknown): string | null {
          if (!isObject(layout)) return null;
          const value = layout['text-field'];
          if (
            Array.isArray(value) &&
            value[0] === 'get' &&
            typeof value[1] === 'string'
          ) {
            return value[1];
          }
          if (typeof value === 'string') {
            const token = value.match(/^\{([^{}]+)\}$/);
            return token?.[1] ?? null;
          }
          return null;
        }

        function hasTextField(layout: unknown): boolean {
          return isObject(layout) && layout['text-field'] !== undefined;
        }

        function isObject(value: unknown): value is Record<string, unknown> {
          return typeof value === 'object' && value !== null && !Array.isArray(value);
        }
      },
      {
        styleValue: hydrated.style,
        fitBounds: bounds,
        timeoutMs: timeout,
      },
    );
    const png = await page.locator('#map').screenshot({ type: 'png' });
    await context.close();
    const uniqueWarnings = [...new Set(warnings)];
    const actionableWarnings = actionableMapLibreWarnings(uniqueWarnings);
    const candidateLabels = browserMetrics.labelMetrics.reduce(
      (total, layer) => total + (layer.candidate_labels ?? 0),
      0,
    );
    const renderedLabels = browserMetrics.labelMetrics.reduce(
      (total, layer) => total + layer.rendered_labels,
      0,
    );
    const candidateBackedRenderedLabels = browserMetrics.labelMetrics.reduce(
      (total, layer) =>
        total + (layer.candidate_labels === null ? 0 : layer.rendered_labels),
      0,
    );

    const metrics: MapLibreRenderMetrics = {
      requested_width: width,
      requested_height: height,
      browser_version: browser.version(),
      resolved_data_urls: hydrated.resolvedUrls,
      resolved_features: hydrated.resolvedFeatures,
      loaded_sources: browserMetrics.loadedSources,
      total_sources: browserMetrics.totalSources,
      rendered_features: browserMetrics.renderedFeatures,
      geometry_layers: browserMetrics.layerMetrics,
      symbol_layers: hydrated.symbolLayers,
      label_layers: browserMetrics.labelMetrics,
      candidate_labels: candidateLabels,
      rendered_labels: renderedLabels,
      label_coverage:
        candidateLabels === 0 ? null : candidateBackedRenderedLabels / candidateLabels,
      label_pixels: browserMetrics.labelPixels,
      edge_label_pixels: browserMetrics.edgeLabelPixels,
      edge_label_ratio:
        browserMetrics.labelPixels === 0
          ? null
          : browserMetrics.edgeLabelPixels / browserMetrics.labelPixels,
      sampled_pixels: browserMetrics.sampledPixels,
      non_background_pixels: browserMetrics.nonBackgroundPixels,
      non_background_ratio:
        browserMetrics.sampledPixels === 0
          ? 0
          : browserMetrics.nonBackgroundPixels / browserMetrics.sampledPixels,
      color_buckets: browserMetrics.colorBuckets,
      png_bytes: png.byteLength,
      png_sha256: sha256(png),
    };
    const checks = [
      check(
        'render.data-resolved',
        hydrated.discoveredUrls === hydrated.resolvedUrls,
        `resolved=${hydrated.resolvedUrls} discovered=${hydrated.discoveredUrls} features=${hydrated.resolvedFeatures}`,
      ),
      check(
        'render.sources-loaded',
        metrics.total_sources > 0 && metrics.loaded_sources === metrics.total_sources,
        `loaded=${metrics.loaded_sources} total=${metrics.total_sources}`,
      ),
      check(
        'render.features-visible',
        metrics.rendered_features > 0,
        `rendered=${metrics.rendered_features} layers=${metrics.geometry_layers
          .map((layer) => `${layer.id}:${layer.rendered_features}`)
          .join(',')}`,
      ),
      check(
        'render.labels-visible',
        candidateLabels === 0 || (renderedLabels > 0 && browserMetrics.labelPixels > 0),
        `candidates=${candidateLabels} rendered=${renderedLabels} pixels=${browserMetrics.labelPixels}`,
      ),
      check(
        'render.labels-source-bounded',
        browserMetrics.labelMetrics.every(
          (layer) =>
            layer.candidate_labels === null ||
            layer.rendered_labels <= layer.candidate_labels,
        ),
        browserMetrics.labelMetrics
          .map(
            (layer) =>
              `${layer.id}:${layer.rendered_labels}/${layer.candidate_labels ?? 'unresolved'}`,
          )
          .join(','),
      ),
      check(
        'render.canvas-nonempty',
        metrics.non_background_pixels > 0 && metrics.color_buckets > 1,
        `non_background=${metrics.non_background_pixels}/${metrics.sampled_pixels} buckets=${metrics.color_buckets}`,
      ),
      check(
        'render.runtime-errors',
        browserMetrics.runtimeErrors.length === 0,
        browserMetrics.runtimeErrors.join('; ') || 'no MapLibre runtime errors',
      ),
      check(
        'render.console-warnings',
        actionableWarnings.length === 0,
        actionableWarnings.join('; ') || 'no actionable browser warnings',
      ),
      check('render.png', png.byteLength > 0, `bytes=${png.byteLength}`),
    ];
    return {
      accepted: checks.every((item) => item.passed),
      checks,
      metrics,
      warnings: uniqueWarnings,
      png,
    };
  } finally {
    if (ownsBrowser) await browser.close();
  }
}

export function actionableMapLibreWarnings(warnings: readonly string[]): string[] {
  return warnings.filter(
    (warning) =>
      !warning.includes(
        'performance warning: READ-usage buffer was written, then fenced, but written again before being read back',
      ),
  );
}

function launchBrowser(executablePath: string): Promise<Browser> {
  return chromium.launch({
    executablePath,
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
}

export async function resolveBrowserPath(explicit?: string): Promise<string> {
  const candidates = [
    explicit,
    process.env['ATLASBENCH_BROWSER'],
    process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : '/usr/bin/google-chrome',
    process.platform === 'win32'
      ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
      : '/usr/bin/chromium',
    process.platform === 'win32'
      ? 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
      : '/usr/bin/chromium-browser',
  ].filter((candidate): candidate is string => candidate !== undefined);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next deterministic browser location.
    }
  }
  throw new Error(
    'No Chrome or Chromium executable found. Pass browser_path or set ATLASBENCH_BROWSER.',
  );
}

interface HydratedMapLibreStyle {
  style: MapLibreStyle;
  discoveredUrls: number;
  resolvedUrls: number;
  resolvedFeatures: number;
  symbolLayers: string[];
}

export function hydrateMapLibreStyle(
  style: MapLibreStyle,
  inputs: readonly InputArtifact[],
): HydratedMapLibreStyle {
  const hydrated = structuredClone(style);
  const artifacts = new Map(
    inputs
      .filter((input) => input.role === 'data')
      .map((input) => [normalizePath(input.path), input]),
  );
  let discoveredUrls = 0;
  let resolvedUrls = 0;
  let resolvedFeatures = 0;
  for (const [sourceId, source] of Object.entries(hydrated.sources)) {
    if (source['type'] !== 'geojson') continue;
    if (typeof source['data'] !== 'string') continue;
    discoveredUrls += 1;
    const artifact = artifacts.get(normalizePath(source['data']));
    if (artifact === undefined) {
      throw new Error(
        `No embedded benchmark input matches MapLibre source '${sourceId}' data URL '${source['data']}'.`,
      );
    }
    const data = JSON.parse(artifact.content) as unknown;
    if (!isFeatureCollection(data)) {
      throw new Error(`MapLibre source '${sourceId}' did not resolve to a GeoJSON FeatureCollection.`);
    }
    source['data'] = data;
    resolvedUrls += 1;
    resolvedFeatures += data.features.length;
  }
  const symbolLayers = hydrated.layers
    .filter((layer) => layer['type'] === 'symbol')
    .map((layer) => String(layer['id']));
  delete (hydrated as unknown as Record<string, unknown>)['glyphs'];
  return {
    style: hydrated,
    discoveredUrls,
    resolvedUrls,
    resolvedFeatures,
    symbolLayers,
  };
}

export function geoBounds(
  inputs: readonly InputArtifact[],
): [[number, number], [number, number]] {
  const coordinates: Array<[number, number]> = [];
  for (const input of inputs.filter((candidate) => candidate.role === 'data')) {
    const data = JSON.parse(input.content) as unknown;
    if (!isFeatureCollection(data)) continue;
    collectCoordinates(data.features, coordinates);
  }
  if (coordinates.length === 0) throw new Error('No GeoJSON coordinates were preserved for rendering.');
  const latitudes = coordinates.map((coordinate) => coordinate[1]);
  const longitudes = coordinates.map((coordinate) => modulo360(coordinate[0])).sort((a, b) => a - b);
  let largestGap = -1;
  let gapIndex = 0;
  for (let index = 0; index < longitudes.length; index += 1) {
    const current = longitudes[index]!;
    const next = index === longitudes.length - 1 ? longitudes[0]! + 360 : longitudes[index + 1]!;
    if (next - current > largestGap) {
      largestGap = next - current;
      gapIndex = index;
    }
  }
  let west = longitudes[(gapIndex + 1) % longitudes.length]!;
  let east = longitudes[gapIndex]!;
  if (east < west) east += 360;
  if (west > 180) {
    west -= 360;
    east -= 360;
  }
  const south = Math.max(-85, Math.min(...latitudes));
  const north = Math.min(85, Math.max(...latitudes));
  const longitudePadding = Math.max(0.01, (east - west) * 0.05);
  const latitudePadding = Math.max(0.01, (north - south) * 0.05);
  return [
    [west - longitudePadding, south - latitudePadding],
    [east + longitudePadding, north + latitudePadding],
  ];
}

function collectCoordinates(value: unknown, result: Array<[number, number]>): void {
  if (!Array.isArray(value)) return;
  if (
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  ) {
    result.push([value[0], value[1]]);
    return;
  }
  for (const item of value) {
    if (isRecord(item) && isRecord(item['geometry'])) {
      collectCoordinates(item['geometry']['coordinates'], result);
    } else {
      collectCoordinates(item, result);
    }
  }
}

function modulo360(value: number): number {
  return ((value % 360) + 360) % 360;
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function isFeatureCollection(
  value: unknown,
): value is { type: 'FeatureCollection'; features: unknown[] } {
  return isRecord(value) && value['type'] === 'FeatureCollection' && Array.isArray(value['features']);
}

function check(code: string, passed: boolean, detail: string): MapLibreRenderCheck {
  return { code, passed, detail };
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
