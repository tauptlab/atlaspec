import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { buildCorpusArtifacts, validateCorpusMatrix } from './corpus.js';

const check = process.argv.includes('--check');
const root = resolve('benchmark', 'corpus');
const artifacts = buildCorpusArtifacts();
const diagnostics = validateCorpusMatrix(artifacts.matrix);
if (diagnostics.length > 0) {
  throw new Error(`Invalid generated corpus:\n${diagnostics.join('\n')}`);
}

const outputs = new Map<string, string>([
  [resolve(root, 'matrix.json'), serialize(artifacts.matrix)],
  [resolve(root, 'development.manifest.json'), serialize(artifacts.development)],
  [resolve(root, 'holdout.manifest.json'), serialize(artifacts.holdout)],
]);
for (const [path, dataset] of artifacts.datasets) {
  outputs.set(resolve(root, path), serialize(dataset));
}

const mismatches: string[] = [];
for (const [path, content] of outputs) {
  if (check) {
    try {
      if ((await readFile(path, 'utf8')) !== content) mismatches.push(path);
    } catch {
      mismatches.push(path);
    }
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  }
}

if (mismatches.length > 0) {
  throw new Error(
    `Corpus artifacts are missing or stale; run npm run corpus:generate:\n${mismatches.join('\n')}`,
  );
}
console.log(
  `${check ? 'VERIFIED' : 'WROTE'} ${artifacts.matrix.tasks.length} tasks, ` +
    `${artifacts.development.tasks.length} development, ` +
    `${artifacts.holdout.tasks.length} holdout, ${artifacts.datasets.size} datasets`,
);

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
