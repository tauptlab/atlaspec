import { describe, expect, it } from 'vitest';

import type { MapLibreStyle } from '../../../src/maplibre.js';
import {
  applyOcclusionAblationDocument,
  applyOcclusionAblationStyle,
  buildOcclusionAblationSchedule,
  OCCLUSION_ABLATION_ARMS,
} from './occlusion-ablation.js';

describe('label-to-symbol occlusion ablation', () => {
  it('rotates every arm through every execution position', () => {
    const schedule = buildOcclusionAblationSchedule(['a', 'b', 'c', 'd']);

    expect(schedule).toHaveLength(16);
    for (const arm of OCCLUSION_ABLATION_ARMS) {
      expect(
        schedule
          .filter((cell) => cell.arm.id === arm.id)
          .map((cell) => cell.position),
      ).toEqual(expect.arrayContaining([1, 2, 3, 4]));
    }
  });

  it('changes capacity range and label offset without mutating inputs', () => {
    const document = {
      data: { fields: { capacity: { range: [12, 900] } } },
    };
    const style = fixtureStyle();
    const arm = OCCLUSION_ABLATION_ARMS[3]!;

    const changedDocument = applyOcclusionAblationDocument(document, arm) as typeof document;
    const changedStyle = applyOcclusionAblationStyle(style, arm);

    expect(changedDocument.data.fields.capacity.range).toEqual([0, 10_000]);
    expect(document.data.fields.capacity.range).toEqual([12, 900]);
    expect(changedStyle.layers[1]?.['layout']).toEqual(
      expect.objectContaining({ 'text-offset': [0, 3] }),
    );
    expect(style.layers[1]?.['layout']).toEqual(
      expect.objectContaining({ 'text-offset': [0, 1.2] }),
    );
  });

  it('reinstates the observed 1.2 em baseline after compiler hardening', () => {
    const hardened = fixtureStyle();
    (hardened.layers[1]?.['layout'] as Record<string, unknown>)['text-offset'] = [
      0,
      3,
    ];

    const observed = applyOcclusionAblationStyle(
      hardened,
      OCCLUSION_ABLATION_ARMS[0]!,
    );

    expect(observed.layers[1]?.['layout']).toEqual(
      expect.objectContaining({ 'text-offset': [0, 1.2] }),
    );
    expect(hardened.layers[1]?.['layout']).toEqual(
      expect.objectContaining({ 'text-offset': [0, 3] }),
    );
  });
});

function fixtureStyle(): MapLibreStyle {
  return {
    version: 8,
    name: 'fixture',
    glyphs: 'https://example.invalid/{fontstack}/{range}.pbf',
    metadata: {},
    sources: {},
    layers: [
      { id: 'map-symbols', type: 'circle' },
      {
        id: 'map-labels',
        type: 'symbol',
        layout: { 'text-field': ['get', 'name'], 'text-offset': [0, 1.2] },
      },
    ],
  };
}
