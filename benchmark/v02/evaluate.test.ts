import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';

import { compileMapLibre } from '../../src/maplibre.js';
import { compileVegaLite } from '../../src/vega-lite.js';
import { buildV02CorpusMatrix } from './corpus.js';
import { evaluateV02Output } from './evaluate.js';
import {
  buildV02Manifests,
  buildV02ReferenceDocument,
} from './manifest.js';

const manifests = buildV02Manifests(buildV02CorpusMatrix());

describe('AtlasBench 0.2 output evaluation', () => {
  it('accepts all four representable reference conditions', () => {
    const task = manifests.development.tasks.find(
      (candidate) => candidate.portability === 'representable',
    )!;
    const document = buildV02ReferenceDocument(task);
    const maplibre = compileMapLibre(document);
    const vegaLite = compileVegaLite(document);
    expect(maplibre.ok).toBe(true);
    expect(vegaLite.ok).toBe(true);
    if (!maplibre.ok || !vegaLite.ok) return;

    expect(
      evaluateV02Output('direct-maplibre', JSON.stringify(maplibre.style), task).accepted,
    ).toBe(true);
    expect(
      evaluateV02Output('direct-vega-lite', JSON.stringify(vegaLite.spec), task).accepted,
    ).toBe(true);
    expect(
      evaluateV02Output('atlaspec-maplibre', stringify(document), task).accepted,
    ).toBe(true);
    expect(
      evaluateV02Output('atlaspec-vega-lite', stringify(document), task).accepted,
    ).toBe(true);
  });

  it('accepts only fail-closed capability behavior for negative controls', () => {
    const task = manifests.development.tasks.find(
      (candidate) => candidate.portability === 'capability-negative',
    )!;
    const document = buildV02ReferenceDocument(task);

    expect(
      evaluateV02Output('vega-capability-negative', stringify(document), task),
    ).toEqual(
      expect.objectContaining({
        accepted: true,
      }),
    );
  });

  it('rejects renderer output when a locked field binding is removed', () => {
    const task = manifests.development.tasks.find(
      (candidate) => candidate.portability === 'representable',
    )!;
    const result = compileMapLibre(buildV02ReferenceDocument(task));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const thematic = result.style.layers.find((layer) => layer['type'] === 'fill')!;
    thematic['paint'] = { 'fill-color': '#000000' };

    const evaluation = evaluateV02Output(
      'direct-maplibre',
      JSON.stringify(result.style),
      task,
    );
    expect(evaluation.accepted).toBe(false);
    expect(evaluation.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'semantic.maplibre.binding-missing',
          passed: false,
        }),
      ]),
    );
  });
});
