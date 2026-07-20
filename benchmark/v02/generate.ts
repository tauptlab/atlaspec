import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  buildV02CorpusMatrix,
  buildV02Datasets,
  validateV02CorpusMatrix,
} from './corpus.js';

const check = process.argv.includes('--check');
const root = resolve('benchmark', 'v02');
const target = resolve(root, 'matrix.json');
const matrix = buildV02CorpusMatrix();
const datasets = buildV02Datasets(matrix);
const diagnostics = validateV02CorpusMatrix(matrix);
if (diagnostics.length > 0) {
  throw new Error(`Invalid AtlasBench 0.2 matrix:\n${diagnostics.join('\n')}`);
}

const outputs = new Map<string, string>([
  [target, `${JSON.stringify(matrix, null, 2)}\n`],
]);
for (const [path, dataset] of datasets) {
  outputs.set(resolve(root, path), `${JSON.stringify(dataset, null, 2)}\n`);
}
const stale: string[] = [];
for (const [path, expected] of outputs) {
  if (check) {
    const actual = await readFile(path, 'utf8').catch(() => '');
    if (actual !== expected) stale.push(path);
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, expected, 'utf8');
  }
}
if (stale.length > 0) {
    throw new Error(
      `AtlasBench 0.2 artifacts are missing or stale; run npm run corpus:v02:generate:\n${stale.join('\n')}`,
    );
}

const development = matrix.tasks.filter((task) => task.split === 'development').length;
const holdout = matrix.tasks.filter((task) => task.split === 'holdout').length;
const representable = matrix.tasks.filter(
  (task) => task.portability === 'representable',
).length;
console.log(
  `${check ? 'VERIFIED' : 'WROTE'} AtlasBench 0.2 matrix: ` +
    `${matrix.tasks.length} tasks, ${development} development, ${holdout} holdout, ` +
    `${representable} representable, ${datasets.size} datasets`,
);
