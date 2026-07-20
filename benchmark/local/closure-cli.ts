import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

import { Command } from 'commander';

import { CommandGenerationAdapter } from '../adapters.js';
import { runExperiment, type ExperimentManifest } from '../experiment.js';
import type { CorpusMatrix } from '../corpus/corpus.js';
import { buildCodexClosureManifest } from './closure.js';

interface Options { output: string; codexVersion: string }

const executeFile = promisify(execFile);
const program = new Command()
  .name('atlasbench-local-closure')
  .description('Run a diagnostic-only Codex probe on the final unused development slice')
  .requiredOption('--output <directory>', 'new closure probe directory')
  .requiredOption('--codex-version <version>', 'exact Codex CLI version output');

program.action(async (options: Options) => {
  try {
    const outputDirectory = resolve(options.output);
    await assertEmptyOutput(outputDirectory);
    const sourcePath = resolve('benchmark/corpus/development.manifest.json');
    const matrixPath = resolve('benchmark/corpus/matrix.json');
    const sourceRaw = await readFile(sourcePath, 'utf8');
    const matrixRaw = await readFile(matrixPath, 'utf8');
    const lockfileRaw = await readFile(resolve('package-lock.json'), 'utf8');
    const { stdout } = await executeFile('git', ['rev-parse', 'HEAD']);
    const compilerCommit = stdout.trim();
    const model = {
      provider: 'codex-cli',
      model: 'default',
      version: `${options.codexVersion};model=unreported`,
    };
    const manifestPath = resolve(outputDirectory, 'manifest.json');
    const manifest = buildCodexClosureManifest(
      JSON.parse(sourceRaw) as ExperimentManifest,
      JSON.parse(matrixRaw) as CorpusMatrix,
      model,
      dirname(sourcePath),
      outputDirectory,
    );
    const manifestRaw = `${JSON.stringify(manifest, null, 2)}\n`;
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(manifestPath, manifestRaw, 'utf8');
    await writeFile(
      resolve(outputDirectory, 'plan.json'),
      `${JSON.stringify({
        schema_version: '0.1',
        probe_id: 'atlasbench-local-codex-closure-v1',
        claim_scope: 'diagnostic-only-not-a-performance-gate',
        compiler_commit: compilerCommit,
        lockfile_sha256: sha256(lockfileRaw),
        source_manifest_sha256: sha256(sourceRaw),
        matrix_sha256: sha256(matrixRaw),
        manifest_sha256: sha256(manifestRaw),
        selection: 'third-development-variant-after-rotated-holdout',
        holdout_exposed: false,
        task_count: 12,
        repetitions: 1,
        expected_runs: 24,
        agent: { id: 'codex', cli_version: options.codexVersion, model },
      }, null, 2)}\n`,
      'utf8',
    );

    const adapter = new CommandGenerationAdapter({
      executable: process.execPath,
      args: [
        resolve('node_modules/tsx/dist/cli.mjs'),
        resolve('benchmark/providers/codex-cli-stdio.ts'),
      ],
    });
    const experiment = await runExperiment(manifestPath, adapter);
    if (experiment.compiler_commit !== compilerCommit || experiment.runs.length !== 24) {
      throw new Error('Closure probe provenance or run count mismatch.');
    }
    await writeFile(
      resolve(outputDirectory, 'report.json'),
      `${JSON.stringify(experiment, null, 2)}\n`,
      'utf8',
    );
    console.log(`WROTE ${resolve(outputDirectory, 'report.json')} runs=24/24`);
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
    if (!isMissing(error)) throw error;
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
