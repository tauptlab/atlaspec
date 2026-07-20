import type {
  AtlaspecV02Document,
  Field,
  MapFamily,
  SpatialSupport,
} from './schema.js';

export interface SemanticFieldBinding {
  channel: 'color' | 'size' | 'category' | 'label' | 'weight';
  field: string;
  path: string;
  measurement: Field['measurement'];
  semantic_type: Field['semantic_type'];
  unit: string | null;
  range: [number, number] | null;
  domain: string[] | null;
}

export interface SemanticLayerRecord {
  id: string;
  purpose: 'primary' | 'supporting' | 'reference';
  family: MapFamily;
  source: string;
  support: SpatialSupport;
  bindings: SemanticFieldBinding[];
  missing_data: 'explicit' | 'hide' | 'error' | null;
  raw_count_choropleth: 'reject' | 'allow' | null;
  zoom_rules: Array<{
    min_zoom: number | null;
    max_zoom: number | null;
    target: 'fill' | 'symbols' | 'labels' | 'heatmap';
    action: 'show' | 'hide' | 'cluster' | 'show-labels';
  }>;
}

export interface SemanticMapRecord {
  version: '0.2';
  map: string;
  intent: AtlaspecV02Document['intent'];
  viewport: { width: number; height: number } | null;
  constraints: {
    colorblind_safe: boolean | null;
    protected_layers: string[];
    label_priority: string[];
    allow_duplicate_labels: boolean;
  };
  layers: SemanticLayerRecord[];
}

const CHANNELS = [
  'color',
  'size',
  'category',
  'label',
  'weight',
] as const;

export function buildSemanticRecord(
  document: AtlaspecV02Document,
): SemanticMapRecord {
  return {
    version: '0.2',
    map: document.map,
    intent: structuredClone(document.intent),
    viewport:
      document.constraints?.viewport === undefined
        ? null
        : structuredClone(document.constraints.viewport),
    constraints: {
      colorblind_safe: document.constraints?.colorblind_safe ?? null,
      protected_layers: [...(document.constraints?.protected_layers ?? [])],
      label_priority: [...(document.constraints?.label_priority ?? [])],
      allow_duplicate_labels:
        document.constraints?.allow_duplicate_labels ?? false,
    },
    layers: document.layers.map((layer) => ({
      id: layer.id,
      purpose: layer.purpose,
      family: layer.family,
      source: layer.encoding.geometry.source,
      support: layer.encoding.geometry.support,
      bindings: CHANNELS.flatMap((channel) => {
        const fieldName = layer.encoding[channel]?.field;
        if (fieldName === undefined) return [];
        const field = document.data.fields[fieldName]!;
        return [fieldBinding(channel, fieldName, field)];
      }),
      missing_data: layer.constraints?.missing_data ?? null,
      raw_count_choropleth:
        layer.constraints?.raw_count_choropleth ?? null,
      zoom_rules: (layer.behavior?.zoom_rules ?? []).map((rule) => ({
        min_zoom: rule.min_zoom ?? null,
        max_zoom: rule.max_zoom ?? null,
        target: rule.target,
        action: rule.action,
      })),
    })),
  };
}

function fieldBinding(
  channel: SemanticFieldBinding['channel'],
  name: string,
  field: Field,
): SemanticFieldBinding {
  return {
    channel,
    field: name,
    path: field.path,
    measurement: field.measurement,
    semantic_type: field.semantic_type,
    unit: field.unit ?? null,
    range: field.range === undefined ? null : [...field.range],
    domain: field.domain === undefined ? null : [...field.domain],
  };
}
