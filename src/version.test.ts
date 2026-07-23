import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ATLASPEC_PACKAGE_VERSION,
  LATEST_ATLASPEC_DOCUMENT_VERSION,
  SUPPORTED_ATLASPEC_DOCUMENT_VERSIONS,
} from './version.js';

describe('Atlaspec version contract', () => {
  it('keeps the package manifest and public package version synchronized', async () => {
    const packageJson = JSON.parse(
      await readFile(resolve('package.json'), 'utf8'),
    ) as { version: string };

    expect(ATLASPEC_PACKAGE_VERSION).toBe(packageJson.version);
  });

  it('declares 0.2 as latest while retaining explicit 0.1 compatibility', () => {
    expect(LATEST_ATLASPEC_DOCUMENT_VERSION).toBe('0.2');
    expect(SUPPORTED_ATLASPEC_DOCUMENT_VERSIONS).toEqual(['0.1', '0.2']);
  });
});
