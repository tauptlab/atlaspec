import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

import { parse as parseYaml } from 'yaml';

export async function loadDocument(path: string): Promise<unknown> {
  const contents = await readFile(path, 'utf8');
  return parseDocument(contents, extname(path));
}

export function parseDocument(contents: string, extension = '.yaml'): unknown {
  if (extension.toLowerCase() === '.json') {
    return JSON.parse(contents) as unknown;
  }

  return parseYaml(contents) as unknown;
}
