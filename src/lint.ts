import type { Diagnostic } from './diagnostics.js';
import type { AtlaspecDocument, Field } from './schema.js';

type EncodingChannel = 'color' | 'size' | 'category' | 'label' | 'weight';

export function lintAtlaspec(document: AtlaspecDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const sourceIds = new Set<string>();

  for (const [index, source] of document.data.sources.entries()) {
    if (sourceIds.has(source.id)) {
      diagnostics.push({
        code: 'data.duplicate-source',
        severity: 'error',
        message: `Source id '${source.id}' is declared more than once.`,
        path: `/data/sources/${index}/id`,
      });
    }
    sourceIds.add(source.id);
  }

  if (!sourceIds.has(document.encoding.geometry.source)) {
    diagnostics.push({
      code: 'encoding.unknown-geometry-source',
      severity: 'error',
      message: `Geometry source '${document.encoding.geometry.source}' is not declared.`,
      path: '/encoding/geometry/source',
    });
  }

  for (const [name, field] of Object.entries(document.data.fields)) {
    lintField(name, field, sourceIds, diagnostics);
  }

  const channels: EncodingChannel[] = [
    'color',
    'size',
    'category',
    'label',
    'weight',
  ];

  for (const channel of channels) {
    const encoding = document.encoding[channel];
    if (encoding === undefined) {
      continue;
    }

    const field = document.data.fields[encoding.field];
    if (field === undefined) {
      diagnostics.push({
        code: 'encoding.unknown-field',
        severity: 'error',
        message: `Encoding channel '${channel}' references unknown field '${encoding.field}'.`,
        path: `/encoding/${channel}/field`,
      });
      continue;
    }

    if (field.source !== document.encoding.geometry.source) {
      diagnostics.push({
        code: 'encoding.cross-source-field',
        severity: 'error',
        message: `Field '${encoding.field}' belongs to source '${field.source}', not geometry source '${document.encoding.geometry.source}'.`,
        path: `/encoding/${channel}/field`,
      });
    }
  }

  lintFamily(document, diagnostics);
  lintZoomRules(document, diagnostics);

  if (document.constraints?.missing_data === undefined) {
    diagnostics.push({
      code: 'constraints.missing-data-unspecified',
      severity: 'warning',
      message: 'Missing-data behavior is not specified.',
      path: '/constraints/missing_data',
    });
  }

  return diagnostics;
}

function lintField(
  name: string,
  field: Field,
  sourceIds: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): void {
  const path = `/data/fields/${escapePointer(name)}`;

  if (!sourceIds.has(field.source)) {
    diagnostics.push({
      code: 'field.unknown-source',
      severity: 'error',
      message: `Field '${name}' references unknown source '${field.source}'.`,
      path: `${path}/source`,
    });
  }

  if (field.range !== undefined && field.range[0] > field.range[1]) {
    diagnostics.push({
      code: 'field.invalid-range',
      severity: 'error',
      message: `Field '${name}' has a descending range.`,
      path: `${path}/range`,
    });
  }

  if (field.semantic_type === 'probability') {
    if (field.measurement !== 'quantitative') {
      diagnostics.push({
        code: 'field.probability-measurement',
        severity: 'error',
        message: `Probability field '${name}' must be quantitative.`,
        path: `${path}/measurement`,
      });
    }

    if (field.range === undefined) {
      diagnostics.push({
        code: 'field.probability-range-missing',
        severity: 'warning',
        message: `Probability field '${name}' should declare a [0, 1] range.`,
        path: `${path}/range`,
      });
    } else if (field.range[0] < 0 || field.range[1] > 1) {
      diagnostics.push({
        code: 'field.probability-range',
        severity: 'error',
        message: `Probability field '${name}' must stay within [0, 1].`,
        path: `${path}/range`,
      });
    }
  }

  if (
    (field.semantic_type === 'count' || field.semantic_type === 'capacity') &&
    field.measurement !== 'quantitative'
  ) {
    diagnostics.push({
      code: 'field.quantitative-measurement',
      severity: 'error',
      message: `${field.semantic_type} field '${name}' must be quantitative.`,
      path: `${path}/measurement`,
    });
  }

  if (
    (field.semantic_type === 'count' || field.semantic_type === 'capacity') &&
    field.range !== undefined &&
    field.range[0] < 0
  ) {
    diagnostics.push({
      code: 'field.nonnegative-range',
      severity: 'error',
      message: `${field.semantic_type} field '${name}' cannot declare a negative minimum.`,
      path: `${path}/range`,
    });
  }

  if (
    (field.semantic_type === 'category' || field.semantic_type === 'label') &&
    field.measurement !== 'nominal'
  ) {
    diagnostics.push({
      code: 'field.nominal-measurement',
      severity: 'error',
      message: `${field.semantic_type} field '${name}' must be nominal.`,
      path: `${path}/measurement`,
    });
  }
}

function lintFamily(
  document: AtlaspecDocument,
  diagnostics: Diagnostic[],
): void {
  const colorField = getField(document, document.encoding.color?.field);
  const sizeField = getField(document, document.encoding.size?.field);
  const categoryField = getField(document, document.encoding.category?.field);

  switch (document.family) {
    case 'choropleth': {
      if (document.encoding.geometry.support !== 'polygon') {
        familyError(diagnostics, 'A choropleth requires polygon geometry.');
      }
      if (document.encoding.color === undefined) {
        diagnostics.push({
          code: 'choropleth.color-required',
          severity: 'error',
          message: 'A choropleth requires a color encoding.',
          path: '/encoding/color',
        });
      }
      if (colorField !== undefined) {
        lintChoroplethColor(document, colorField, diagnostics);
      }
      break;
    }
    case 'proportional-symbol': {
      if (document.encoding.geometry.support !== 'point') {
        familyError(
          diagnostics,
          'A proportional-symbol map requires point geometry in version 0.1.',
        );
      }
      if (document.encoding.size === undefined) {
        diagnostics.push({
          code: 'proportional-symbol.size-required',
          severity: 'error',
          message: 'A proportional-symbol map requires a size encoding.',
          path: '/encoding/size',
        });
      } else if (
        sizeField !== undefined &&
        sizeField.measurement !== 'quantitative'
      ) {
        diagnostics.push({
          code: 'proportional-symbol.quantitative-size',
          severity: 'error',
          message: 'Proportional symbol size must use a quantitative field.',
          path: '/encoding/size/field',
        });
      }
      break;
    }
    case 'categorical-point': {
      if (document.encoding.geometry.support !== 'point') {
        familyError(diagnostics, 'A categorical-point map requires point geometry.');
      }
      if (document.encoding.category === undefined) {
        diagnostics.push({
          code: 'categorical-point.category-required',
          severity: 'error',
          message: 'A categorical-point map requires a category encoding.',
          path: '/encoding/category',
        });
      } else if (
        categoryField !== undefined &&
        categoryField.measurement !== 'nominal'
      ) {
        diagnostics.push({
          code: 'categorical-point.nominal-category',
          severity: 'error',
          message: 'Categorical point symbols must use a nominal field.',
          path: '/encoding/category/field',
        });
      }
      break;
    }
    case 'heatmap': {
      if (
        document.encoding.geometry.support !== 'point' &&
        document.encoding.geometry.support !== 'grid'
      ) {
        familyError(diagnostics, 'A heatmap requires point or grid geometry.');
      }
      if (
        document.encoding.weight !== undefined &&
        getField(document, document.encoding.weight.field)?.measurement !==
          'quantitative'
      ) {
        diagnostics.push({
          code: 'heatmap.quantitative-weight',
          severity: 'error',
          message: 'Heatmap weight must use a quantitative field.',
          path: '/encoding/weight/field',
        });
      }
      break;
    }
  }
}

function lintChoroplethColor(
  document: AtlaspecDocument,
  field: Field,
  diagnostics: Diagnostic[],
): void {
  if (field.measurement === 'nominal') {
    diagnostics.push({
      code: 'choropleth.non-ordered-color',
      severity: 'error',
      message: 'Version 0.1 choropleth color must represent ordered data.',
      path: '/encoding/color/field',
    });
  }

  if (field.semantic_type !== 'count') {
    return;
  }

  const normalized =
    field.normalization !== undefined && field.normalization !== 'none';
  const override = document.constraints?.raw_count_choropleth === 'allow';

  if (!normalized && !override) {
    diagnostics.push({
      code: 'choropleth.raw-count',
      severity: 'error',
      message: 'Raw counts on unequal-area polygons require normalization or an explicit override.',
      path: '/encoding/color/field',
    });
  } else if (!normalized && override) {
    diagnostics.push({
      code: 'choropleth.raw-count-override',
      severity: 'warning',
      message: 'Raw-count choropleth safety was explicitly overridden.',
      path: '/constraints/raw_count_choropleth',
    });
  }
}

function lintZoomRules(
  document: AtlaspecDocument,
  diagnostics: Diagnostic[],
): void {
  for (const [index, rule] of (document.behavior?.zoom_rules ?? []).entries()) {
    if (
      rule.min_zoom !== undefined &&
      rule.max_zoom !== undefined &&
      rule.min_zoom > rule.max_zoom
    ) {
      diagnostics.push({
        code: 'behavior.invalid-zoom-range',
        severity: 'error',
        message: 'Zoom rule minimum exceeds its maximum.',
        path: `/behavior/zoom_rules/${index}`,
      });
    }
  }
}

function getField(
  document: AtlaspecDocument,
  name: string | undefined,
): Field | undefined {
  return name === undefined ? undefined : document.data.fields[name];
}

function familyError(diagnostics: Diagnostic[], message: string): void {
  diagnostics.push({
    code: 'family.geometry-mismatch',
    severity: 'error',
    message,
    path: '/encoding/geometry/support',
  });
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}
