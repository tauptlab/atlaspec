import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

import { Command } from 'commander';

import type { ExperimentManifest } from '../experiment.js';
import type { CorpusMatrix } from '../corpus/corpus.js';
import {
  buildLocalQualificationBundle,
  serializeLocalManifest,
} from './bundle.js';

interface Options {
  output: string;
  codexVersion: string;
  claudeCliVersion: string;
  claudeModel: string;
  claudeVersion: string;
}

const executeFile = promisify(execFile);
const program = new Command()
  .name('atlasbench-local-prepare')
  .description('Prepare the pre-committed local Codex and Claude qualification')
  .requiredOption('--output <directory>', 'new local qualification directory')
  .requiredOption('--codex-version <version>', 'exact Codex CLI version output')
  .requiredOption('--claude-cli-version <version>', 'exact Claude Code version output')
  .requiredOption('--claude-model <model>', 'Claude model selector')
  .requiredOption('--claude-version <version>', 'resolved Claude model version');

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
    const bundle = buildLocalQualificationBundle(
      JSON.parse(sourceRaw) as ExperimentManifest,
      JSON.parse(matrixRaw) as CorpusMatrix,
      {
        agents: [
          {
            id: 'codex',
            cli_version: options.codexVersion,
            model: {
              provider: 'codex-cli',
              model: 'default',
              version: `${options.codexVersion};model=unreported`,
            },
            cost_observed: false,
          },
          {
            id: 'claude',
            cli_version: options.claudeCliVersion,
            model: {
              provider: 'claude-cli',
              model: options.claudeModel,
              version: options.claudeVersion,
            },
            cost_observed: true,
          },
        ],
        source_manifest_raw: sourceRaw,
        matrix_raw: matrixRaw,
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
      await writeFile(target, serializeLocalManifest(manifest), 'utf8');
    }
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      resolve(outputDirectory, 'local-plan.json'),
      `${JSON.stringify(bundle.ledger, null, 2)}\n`,
      'utf8',
    );
    console.log(
      `PREPARED ${bundle.ledger.totals.jobs} jobs, ${bundle.ledger.totals.expected_runs} runs, ` +
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
    if (!isMissing(error)) throw error;
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
