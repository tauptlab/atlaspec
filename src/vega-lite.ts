import type { Diagnostic } from './diagnostics.js';
import type { CompilationDecision } from './maplibre.js';
import type {
  AtlaspecLayer,
  AtlaspecV02Document,
  DataSource,
  Field,
} from './schema.js';
import { validateAtlaspec } from './validate.js';
import { buildSemanticRecord } from './semantic.js';

export type VegaLiteSpec = Record<string, unknown>;

export type VegaLiteCompilationResult =
  | {
      ok: true;
      spec: VegaLiteSpec;
      decisions: CompilationDecision[];
      diagnostics: Diagnostic[];
    }
  | {
      ok: false;
      diagnostics: Diagnostic[];
    };

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

export function compileVegaLite(value: unknown): VegaLiteCompilationResult {
  const validation = validateAtlaspec(value);
  if (!validation.valid) {
    return { ok: false, diagnostics: validation.diagnostics };
  }
  if ((value as { version: string }).version !== '0.2') {
    return {
      ok: false,
      diagnostics: [
        capabilityDiagnostic(
          'vega-lite.version-required',
          '/version',
          'Vega-Lite compilation requires an Atlaspec 0.2 document. Upgrade the document first.',
        ),
      ],
    };
  }

  const document = value as AtlaspecV02Document;
  const capabilityDiagnostics = inspectVegaLiteCapabilities(document);
  if (capabilityDiagnostics.length > 0) {
    return { ok: false, diagnostics: capabilityDiagnostics };
  }

  const decisions: CompilationDecision[] = [];
  const layers = document.layers.flatMap((layer, index) =>
    compileLayer(document, layer, index, decisions),
  );
  const viewport = document.constraints?.viewport;
  const background =
    document.basemap?.style === 'minimal-dark'
      ? '#111827'
      : document.basemap?.style === 'none'
        ? null
        : '#f8fafc';

  const spec: VegaLiteSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    title: document.title,
    description: document.description ?? document.intent.primary_message,
    width: viewport?.width ?? 960,
    height: viewport?.height ?? 640,
    background,
    projection: { type: 'mercator' },
    layer: layers,
    usermeta: {
      atlaspec: {
        version: document.version,
        map: document.map,
        intent: document.intent,
        constraints: document.constraints ?? {},
        semantic: buildSemanticRecord(document),
        layers: document.layers.map((layer) => ({
          id: layer.id,
          purpose: layer.purpose,
          family: layer.family,
        })),
        decisions,
      },
    },
  };

  return {
    ok: true,
    spec,
    decisions,
    diagnostics: validation.diagnostics,
  };
}

export function inspectVegaLiteCapabilities(
  document: AtlaspecV02Document,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const [index, layer] of document.layers.entries()) {
    const root = `/layers/${index}`;
    if (layer.family === 'heatmap') {
      diagnostics.push(
        capabilityDiagnostic(
          'vega-lite.unsupported-heatmap',
          `${root}/family`,
          'Atlaspec heatmap kernels are not representable by the Vega-Lite 0.2 target.',
        ),
      );
    }
    if ((layer.behavior?.zoom_rules.length ?? 0) > 0) {
      diagnostics.push(
        capabilityDiagnostic(
          'vega-lite.unsupported-semantic-zoom',
          `${root}/behavior/zoom_rules`,
          'Static Vega-Lite output cannot preserve Atlaspec semantic zoom or clustering rules.',
        ),
      );
    }
    if (
      layer.encoding.label !== undefined &&
      layer.encoding.geometry.support !== 'point'
    ) {
      diagnostics.push(
        capabilityDiagnostic(
          'vega-lite.unsupported-nonpoint-label',
          `${root}/encoding/label`,
          'The Vega-Lite 0.2 target supports labels only for point geometry.',
        ),
      );
    }
    if (
      layer.family === 'proportional-symbol' &&
      layer.constraints?.missing_data === 'explicit'
    ) {
      diagnostics.push(
        capabilityDiagnostic(
          'vega-lite.unsupported-explicit-missing-symbol',
          `${root}/constraints/missing_data`,
          'The Vega-Lite 0.2 target cannot yet preserve an explicit missing-value symbol and legend for proportional symbols.',
        ),
      );
    }
  }
  return diagnostics;
}

function compileLayer(
  document: AtlaspecV02Document,
  layer: AtlaspecLayer,
  index: number,
  decisions: CompilationDecision[],
): VegaLiteSpec[] {
  const source = document.data.sources.find(
    (candidate) => candidate.id === layer.encoding.geometry.source,
  )!;
  const data = compileData(source);
  const name = `${document.map}-${layer.id}`;
  const compiled: VegaLiteSpec[] = [];

  switch (layer.family) {
    case 'choropleth': {
      const colorName = layer.encoding.color!.field;
      const colorField = document.data.fields[colorName]!;
      compiled.push({
        name: `${name}-fill`,
        data,
        ...optionalTransform(missingTransforms(layer, colorField)),
        mark: { type: 'geoshape', stroke: '#ffffff', strokeWidth: 0.6 },
        encoding: {
          color: quantitativeColor(
            colorName,
            colorField,
            layer.constraints?.missing_data,
          ),
        },
      });
      decisions.push({
        code: 'vega-lite.geoshape-choropleth',
        path: `/layers/${index}/encoding/color`,
        value: { mark: 'geoshape', field: colorName },
        reason: 'Polygon color semantics were mapped to a Vega-Lite geoshape mark.',
      });
      break;
    }
    case 'proportional-symbol': {
      const sizeName = layer.encoding.size!.field;
      const sizeField = document.data.fields[sizeName]!;
      compiled.push({
        name: `${name}-symbols`,
        data,
        transform: [...pointTransforms(), ...missingTransforms(layer, sizeField)],
        mark: {
          type: 'circle',
          opacity: 0.82,
          color: '#0072b2',
          stroke: '#ffffff',
          strokeWidth: 1,
        },
        encoding: {
          ...positionEncoding(),
          size: {
            field: propertyField(sizeField),
            type: 'quantitative',
            scale: {
              type: 'sqrt',
              ...(sizeField.range === undefined
                ? {}
                : { domain: sizeField.range }),
              range: [20, 800],
            },
            legend: legend(sizeName, sizeField),
          },
        },
      });
      decisions.push({
        code: 'vega-lite.area-proportional-circle',
        path: `/layers/${index}/encoding/size`,
        value: { mark: 'circle', scale: 'sqrt', field: sizeName },
        reason: 'Quantitative size was mapped to area-proportional circles.',
      });
      break;
    }
    case 'categorical-point': {
      const categoryName = layer.encoding.category!.field;
      const categoryField = document.data.fields[categoryName]!;
      const domain = categoryField.domain!;
      const explicitMissing = layer.constraints?.missing_data === 'explicit';
      const encodedDomain = explicitMissing ? [...domain, 'Missing'] : domain;
      const categoryTransforms = explicitMissing
        ? [
            {
              calculate: `isValid(${propertyExpression(categoryField)}) ? ${propertyExpression(categoryField)} : 'Missing'`,
              as: '_atlaspec_category',
            },
          ]
        : missingTransforms(layer, categoryField);
      compiled.push({
        name: `${name}-symbols`,
        data,
        transform: [...pointTransforms(), ...categoryTransforms],
        mark: {
          type: 'circle',
          size: 110,
          stroke: '#ffffff',
          strokeWidth: 1,
        },
        encoding: {
          ...positionEncoding(),
          color: {
            field: explicitMissing
              ? '_atlaspec_category'
              : propertyField(categoryField),
            type: 'nominal',
            scale: {
              domain: encodedDomain,
              range: encodedDomain.map((_value, domainIndex) =>
                domainIndex === domain.length
                  ? '#9ca3af'
                  : CATEGORICAL_PALETTE[
                      domainIndex % CATEGORICAL_PALETTE.length
                    ],
              ),
            },
            legend: legend(categoryName, categoryField),
          },
        },
      });
      decisions.push({
        code: 'vega-lite.categorical-circle',
        path: `/layers/${index}/encoding/category`,
        value: { mark: 'circle', field: categoryName, domain },
        reason: 'Nominal point categories were mapped to a deterministic circle palette.',
      });
      break;
    }
    case 'heatmap':
      break;
  }

  const labelName = layer.encoding.label?.field;
  if (labelName !== undefined) {
    const labelField = document.data.fields[labelName]!;
    compiled.push({
      name: `${name}-labels`,
      data,
      transform: [
        ...pointTransforms(),
        ...missingTransforms(layer, primaryField(document, layer)),
      ],
      mark: {
        type: 'text',
        align: 'left',
        baseline: 'middle',
        dx: 8,
        fontSize: 12,
        color:
          document.basemap?.style === 'minimal-dark' ? '#f8fafc' : '#111827',
      },
      encoding: {
        ...positionEncoding(),
        text: { field: propertyField(labelField), type: 'nominal' },
      },
    });
    decisions.push({
      code: 'vega-lite.point-label',
      path: `/layers/${index}/encoding/label`,
      value: { mark: 'text', field: labelName },
      reason: 'Point labels were compiled as a colocated Vega-Lite text layer.',
    });
  }

  if (layer.constraints?.missing_data !== undefined) {
    decisions.push({
      code: `vega-lite.missing-data-${layer.constraints.missing_data}`,
      path: `/layers/${index}/constraints/missing_data`,
      value: layer.constraints.missing_data,
      reason:
        layer.constraints.missing_data === 'hide'
          ? 'Invalid encoded values are removed with a deterministic Vega transform.'
          : layer.constraints.missing_data === 'explicit'
            ? 'Missing encoded values receive an explicit deterministic visual fallback.'
            : 'The authored data contract requires encoded values to be present.',
    });
  }

  return compiled;
}

function compileData(source: DataSource): Record<string, unknown> {
  return 'url' in source
    ? { url: source.url, format: { type: 'json', property: 'features' } }
    : { values: source.data.features };
}

function pointTransforms(): Array<Record<string, string>> {
  return [
    { calculate: 'datum.geometry.coordinates[0]', as: '_atlaspec_lon' },
    { calculate: 'datum.geometry.coordinates[1]', as: '_atlaspec_lat' },
  ];
}

function positionEncoding(): Record<string, unknown> {
  return {
    longitude: { field: '_atlaspec_lon', type: 'quantitative' },
    latitude: { field: '_atlaspec_lat', type: 'quantitative' },
  };
}

function quantitativeColor(
  name: string,
  field: Field,
  missingData: 'explicit' | 'hide' | 'error' | undefined,
): Record<string, unknown> {
  const definition = {
    field: propertyField(field),
    type: field.measurement === 'ordinal' ? 'ordinal' : 'quantitative',
    scale: {
      scheme: 'viridis',
      ...(field.range === undefined ? {} : { domain: field.range }),
    },
    legend: legend(name, field),
  };
  return missingData === 'explicit'
    ? {
      condition: {
          test: `isValid(${propertyExpression(field)})`,
          ...definition,
        },
        value: '#d1d5db',
      }
    : definition;
}

function legend(name: string, field: Field): Record<string, unknown> {
  return {
    title: field.unit === undefined ? name : `${name} (${field.unit})`,
  };
}

function propertyField(field: Field): string {
  return `properties.${escapeVegaField(field.path)}`;
}

function propertyExpression(field: Field): string {
  return `datum['properties']['${escapeExpressionString(field.path)}']`;
}

function escapeVegaField(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('.', '\\.')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]');
}

function escapeExpressionString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function missingTransforms(
  layer: AtlaspecLayer,
  field: Field,
): Array<Record<string, string>> {
  return layer.constraints?.missing_data === 'hide'
    ? [{ filter: `isValid(${propertyExpression(field)})` }]
    : [];
}

function optionalTransform(
  transforms: Array<Record<string, string>>,
): Record<string, unknown> {
  return transforms.length === 0 ? {} : { transform: transforms };
}

function primaryField(
  document: AtlaspecV02Document,
  layer: AtlaspecLayer,
): Field {
  const name =
    layer.encoding.color?.field ??
    layer.encoding.size?.field ??
    layer.encoding.category?.field ??
    layer.encoding.weight?.field;
  return document.data.fields[name!]!;
}

function capabilityDiagnostic(
  code: string,
  path: string,
  message: string,
): Diagnostic {
  return { code, severity: 'error', path, message };
}
