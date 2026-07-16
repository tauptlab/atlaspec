import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

import { Command } from 'commander';

import type { ExperimentManifest } from '../experiment.js';
import {
  buildOfficialDevelopmentBundle,
  serializeOfficialManifest,
} from './plan.js';

interface Options {
  plan: string;
  output: string;
  source: string;
}

const executeFile = promisify(execFile);
const program = new Command()
  .name('atlasbench-official-prepare')
  .description('Prepare sharded, development-only official benchmark jobs')
  .requiredOption('--plan <file>', 'locked official model plan')
  .requiredOption('--output <directory>', 'new output bundle directory')
  .option(
    '--source <file>',
    'frozen development manifest',
    'benchmark/corpus/development.manifest.json',
  );

program.action(async (options: Options) => {
  try {
    const outputDirectory = resolve(options.output);
    await assertEmptyOutput(outputDirectory);
    const planRaw = await readFile(resolve(options.plan), 'utf8');
    const sourcePath = resolve(options.source);
    const sourceRaw = await readFile(sourcePath, 'utf8');
    const lockfileRaw = await readFile(resolve('package-lock.json'), 'utf8');
    const { stdout } = await executeFile('git', ['rev-parse', 'HEAD']);
    const bundle = buildOfficialDevelopmentBundle(
      JSON.parse(planRaw) as unknown,
      JSON.parse(sourceRaw) as ExperimentManifest,
      {
        source_manifest_raw: sourceRaw,
        source_directory: dirname(sourcePath),
        output_directory: outputDirectory,
        lockfile_raw: lockfileRaw,
        compiler_commit: stdout.trim(),
        generated_at: new Date().toISOString(),
      },
    );

    for (const [relativePath, manifest] of bundle.manifests) {
      const target = resolve(outputDirectory, relativePath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, serializeOfficialManifest(manifest), 'utf8');
    }
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      resolve(outputDirectory, 'official-plan.json'),
      `${JSON.stringify(bundle.ledger, null, 2)}\n`,
      'utf8',
    );
    console.log(
      `PREPARED ${bundle.ledger.totals.jobs} jobs, ${bundle.ledger.totals.base_generation_calls} base calls, ` +
        `${bundle.ledger.totals.max_generation_calls} maximum calls; holdout not exposed`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});

await program.parseAsync(process.argv);

async function assertEmptyOutput(path: string): Promise<void> {
  try {
    const entries = await readdir(path);
    if (entries.length > 0) throw new Error(`Output directory is not empty: ${path}`);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
