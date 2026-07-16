import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compileMapLibre } from '../src/maplibre.js';
import { loadDocument } from '../src/load.js';
import { evaluateGeneratedOutput } from './evaluate-generated.js';

const requirements = {
  family: 'choropleth' as const,
  maplibre_layer_types: ['fill'],
  vega_lite_mark_types: ['geoshape'],
  atlaspec_decisions: ['color.palette-inferred'],
};

describe('generated map evaluation', () => {
  it('accepts Atlaspec only after compilation and semantic checks', async () => {
    const output = await readFile(
      resolve('examples', 'flood-risk.atlas.yaml'),
      'utf8',
    );
    const result = evaluateGeneratedOutput('atlaspec', output, requirements);

    expect(result.accepted).toBe(true);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'atlaspec.compile', passed: true }),
        expect.objectContaining({
          code: 'decision.color.palette-inferred',
          passed: true,
        }),
      ]),
    );
  });

  it('accepts a direct MapLibre output only after official validation', async () => {
    const document = await loadDocument(
      resolve('examples', 'flood-risk.atlas.yaml'),
    );
    const compiled = compileMapLibre(document);
    if (!compiled.ok) throw new Error('fixture failed to compile');

    const result = evaluateGeneratedOutput(
      'direct-maplibre',
      JSON.stringify(compiled.style),
      requirements,
    );
    expect(result.accepted).toBe(true);
  });

  it('accepts Vega-Lite only after Vega compilation and mark checks', () => {
    const output = JSON.stringify({
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      data: {
        values: {
          type: 'FeatureCollection',
          features: [],
        },
      },
      mark: 'geoshape',
      encoding: {
        color: { field: 'risk', type: 'quantitative' },
      },
    });
    const result = evaluateGeneratedOutput(
      'direct-vega-lite',
      output,
      requirements,
    );

    expect(result.accepted).toBe(true);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        code: 'vega-lite-mark.geoshape',
        passed: true,
      }),
    );
  });

  it('keeps malformed and semantically incomplete outputs in failure', () => {
    expect(
      evaluateGeneratedOutput('direct-maplibre', '{}', requirements).accepted,
    ).toBe(false);
    expect(
      evaluateGeneratedOutput(
        'direct-vega-lite',
        JSON.stringify({ mark: 'point' }),
        requirements,
      ).accepted,
    ).toBe(false);
    expect(
      evaluateGeneratedOutput('atlaspec-repair', 'not: atlaspec', requirements)
        .accepted,
    ).toBe(false);
  });
});
