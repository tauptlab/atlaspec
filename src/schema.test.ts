import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { AtlaspecSchema } from './schema.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(AtlaspecSchema);

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
});
