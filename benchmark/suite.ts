import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

import { Ajv } from 'ajv';

import { evaluateTask } from './evaluate.js';
import {
  BenchmarkManifestSchema,
  type BenchmarkManifest,
  type BenchmarkReport,
} from './manifest.js';

const executeFile = promisify(execFile);
const ajv = new Ajv({ allErrors: true, strict: false });
const validateManifest = ajv.compile<BenchmarkManifest>(BenchmarkManifestSchema);

export async function runSuite(manifestPath: string): Promise<BenchmarkReport> {
  const absoluteManifest = resolve(manifestPath);
  const manifestValue = JSON.parse(
    await readFile(absoluteManifest, 'utf8'),
  ) as unknown;

  if (!validateManifest(manifestValue)) {
    throw new Error(
      `Invalid benchmark manifest: ${ajv.errorsText(validateManifest.errors)}`,
    );
  }

  const results = [];
  for (const task of manifestValue.tasks) {
    results.push(await evaluateTask(dirname(absoluteManifest), task));
  }

  const accepted = results.filter((result) => result.accepted).length;
  return {
    schema_version: '0.1',
    suite: manifestValue.suite,
    condition: 'atlaspec-fixture',
    compiler_commit: await readCommit(),
    node_version: process.version,
    generated_at: new Date().toISOString(),
    attempted: results.length,
    accepted,
    reliable_map_yield: accepted / results.length,
    results,
  };
}

async function readCommit(): Promise<string> {
  try {
    const { stdout } = await executeFile('git', ['rev-parse', 'HEAD']);
    return stdout.trim();
  } catch {
    return 'unknown';
  }
}
