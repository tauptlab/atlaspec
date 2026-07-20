import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { buildV02CorpusMatrix, validateV02CorpusMatrix } from './corpus.js';

const check = process.argv.includes('--check');
const target = resolve('benchmark', 'v02', 'matrix.json');
const matrix = buildV02CorpusMatrix();
const diagnostics = validateV02CorpusMatrix(matrix);
if (diagnostics.length > 0) {
  throw new Error(`Invalid AtlasBench 0.2 matrix:\n${diagnostics.join('\n')}`);
}

const expected = `${JSON.stringify(matrix, null, 2)}\n`;
if (check) {
  const actual = await readFile(target, 'utf8').catch(() => '');
  if (actual !== expected) {
    throw new Error(
      'AtlasBench 0.2 matrix is missing or stale; run npm run corpus:v02:generate.',
    );
  }
} else {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, expected, 'utf8');
}

const development = matrix.tasks.filter((task) => task.split === 'development').length;
const holdout = matrix.tasks.filter((task) => task.split === 'holdout').length;
const representable = matrix.tasks.filter(
  (task) => task.portability === 'representable',
).length;
console.log(
  `${check ? 'VERIFIED' : 'WROTE'} AtlasBench 0.2 matrix: ` +
    `${matrix.tasks.length} tasks, ${development} development, ${holdout} holdout, ` +
    `${representable} representable`,
);
