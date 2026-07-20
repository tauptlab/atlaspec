import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  AtlaspecSchema,
  AtlaspecV01Schema,
  AtlaspecV02Schema,
} from './schema.js';
import { upgradeAtlaspec } from './migrate.js';

const validate = new Ajv({ allErrors: true, strict: false }).compile(AtlaspecSchema);
const validateV01 = new Ajv({ allErrors: true, strict: false }).compile(AtlaspecV01Schema);
const validateV02 = new Ajv({ allErrors: true, strict: false }).compile(AtlaspecV02Schema);

async function readExample(name: string): Promise<unknown> {
  const contents = await readFile(
    resolve(process.cwd(), 'examples', name),
    'utf8',
  );

  return parse(contents);
}

describe('AtlaspecSchema', () => {
  it.each([
    'flood-risk.atlas.yaml',
    'shelter-capacity.atlas.yaml',
    'facility-types.atlas.yaml',
    'incident-density.atlas.yaml',
  ])(
    'accepts canonical example %s',
    async (name) => {
      const document = await readExample(name);

      expect(validate(document), JSON.stringify(validate.errors)).toBe(true);
    },
  );

  it('rejects unknown top-level properties', async () => {
    const document = (await readExample('flood-risk.atlas.yaml')) as Record<
      string,
      unknown
    >;
    document['renderer'] = 'maplibre';

    expect(validate(document)).toBe(false);
    expect(validate.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ keyword: 'additionalProperties' }),
      ]),
    );
  });

  it('accepts explicit 0.1 and 0.2 branches without weakening either schema', async () => {
    const v01 = await readExample('flood-risk.atlas.yaml');
    const v02 = upgradeAtlaspec(v01 as Parameters<typeof upgradeAtlaspec>[0]);

    expect(validateV01(v01)).toBe(true);
    expect(validateV02(v02), JSON.stringify(validateV02.errors)).toBe(true);
    expect(validate(v02), JSON.stringify(validate.errors)).toBe(true);
    expect(validateV01(v02)).toBe(false);
    expect(validateV02(v01)).toBe(false);
  });
});
