import type { MapLibreStyle } from '../../../src/maplibre.js';

export type OcclusionAblationArmId =
  | 'observed'
  | 'reference-range'
  | 'adaptive-offset'
  | 'reference-range-adaptive-offset';

export interface OcclusionAblationArm {
  id: OcclusionAblationArmId;
  capacity_range: [number, number] | null;
  label_offset_em: number | null;
}

export interface OcclusionAblationCell {
  case_id: string;
  arm: OcclusionAblationArm;
  position: number;
}

export const OCCLUSION_ABLATION_ARMS: readonly OcclusionAblationArm[] = [
  {
    id: 'observed',
    capacity_range: null,
    label_offset_em: null,
  },
  {
    id: 'reference-range',
    capacity_range: [0, 10_000],
    label_offset_em: null,
  },
  {
    id: 'adaptive-offset',
    capacity_range: null,
    label_offset_em: 3,
  },
  {
    id: 'reference-range-adaptive-offset',
    capacity_range: [0, 10_000],
    label_offset_em: 3,
  },
];

export function buildOcclusionAblationSchedule(
  caseIds: readonly string[],
): OcclusionAblationCell[] {
  return caseIds.flatMap((caseId, caseIndex) =>
    OCCLUSION_ABLATION_ARMS.map((_, position) => {
      const arm =
        OCCLUSION_ABLATION_ARMS[
          (position + caseIndex) % OCCLUSION_ABLATION_ARMS.length
        ]!;
      return { case_id: caseId, arm, position: position + 1 };
    }),
  );
}

export function applyOcclusionAblationDocument(
  value: unknown,
  arm: OcclusionAblationArm,
): unknown {
  const document = structuredClone(value);
  if (arm.capacity_range === null) return document;
  if (!isRecord(document) || !isRecord(document['data'])) {
    throw new Error('Ablation document does not contain data.');
  }
  const fields = document['data']['fields'];
  if (!isRecord(fields) || !isRecord(fields['capacity'])) {
    throw new Error('Ablation document does not declare data.fields.capacity.');
  }
  fields['capacity']['range'] = [...arm.capacity_range];
  return document;
}

export function applyOcclusionAblationStyle(
  value: MapLibreStyle,
  arm: OcclusionAblationArm,
): MapLibreStyle {
  const style = structuredClone(value);
  if (arm.label_offset_em === null) return style;
  const labels = style.layers.filter(
    (layer) =>
      layer['type'] === 'symbol' &&
      isRecord(layer['layout']) &&
      layer['layout']['text-field'] !== undefined &&
      !String(layer['id']).endsWith('-cluster-count'),
  );
  if (labels.length === 0) {
    throw new Error('Compiled ablation style does not contain an authored label layer.');
  }
  for (const layer of labels) {
    (layer['layout'] as Record<string, unknown>)['text-offset'] = [
      0,
      arm.label_offset_em,
    ];
  }
  return style;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
