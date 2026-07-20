import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { validateAtlaspec } from './validate.js';

async function example(name: string): Promise<Record<string, unknown>> {
  const contents = await readFile(resolve('examples', name), 'utf8');
  return parse(contents) as Record<string, unknown>;
}

describe('validateAtlaspec', () => {
  it('accepts the canonical examples without warnings', async () => {
    for (const name of [
      'flood-risk.atlas.yaml',
      'shelter-capacity.atlas.yaml',
      'facility-types.atlas.yaml',
      'incident-density.atlas.yaml',
    ]) {
      expect(validateAtlaspec(await example(name))).toEqual({
        valid: true,
        diagnostics: [],
      });
    }
  });

  it('rejects raw-count choropleths without normalization', async () => {
    const document = await example('flood-risk.atlas.yaml');
    const data = document['data'] as Record<string, unknown>;
    const fields = data['fields'] as Record<string, Record<string, unknown>>;
    const risk = fields['flood_probability'];
    expect(risk).toBeDefined();
    risk!['semantic_type'] = 'count';
    risk!['normalization'] = 'none';
    risk!['range'] = [0, 1000];

    const report = validateAtlaspec(document);

    expect(report.valid).toBe(false);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'choropleth.raw-count' }),
      ]),
    );
  });

  it('rejects references to undeclared encoding fields', async () => {
    const document = await example('shelter-capacity.atlas.yaml');
    const encoding = document['encoding'] as Record<
      string,
      Record<string, unknown>
    >;
    encoding['size']!['field'] = 'unknown_capacity';

    const report = validateAtlaspec(document);

    expect(report.valid).toBe(false);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'encoding.unknown-field',
          path: '/encoding/size/field',
        }),
      ]),
    );
  });

  it('reports schema and semantic diagnostics with stable codes', async () => {
    const document = await example('flood-risk.atlas.yaml');
    document['unexpected'] = true;

    const report = validateAtlaspec(document);

    expect(report).toEqual({
      valid: false,
      diagnostics: [
        expect.objectContaining({
          code: 'schema.additionalProperties',
          path: '/unexpected',
          severity: 'error',
        }),
      ],
    });
  });

  it('collapses union branches into one actionable enum diagnostic', async () => {
    const document = await example('flood-risk.atlas.yaml');
    const intent = document['intent'] as Record<string, unknown>;
    intent['task'] = 'explore';

    const report = validateAtlaspec(document);

    expect(report.valid).toBe(false);
    expect(report.diagnostics).toEqual([
      expect.objectContaining({
        code: 'schema.enum',
        path: '/intent/task',
        message: expect.stringContaining('"compare"'),
      }),
    ]);
  });

  it('accepts ordinal heatmap weights declared by the benchmark corpus', async () => {
    const document = await example('incident-density.atlas.yaml');
    const data = document['data'] as Record<string, unknown>;
    const fields = data['fields'] as Record<string, Record<string, unknown>>;
    fields['severity']!['measurement'] = 'ordinal';

    expect(validateAtlaspec(document).valid).toBe(true);
  });
});
