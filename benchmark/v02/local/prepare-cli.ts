import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { Command } from 'commander';

import type { V02CorpusMatrix } from '../corpus.js';
import type { V02EvaluationManifest } from '../manifest.js';
import {
  buildV02LocalQualificationLedger,
  serializeV02LocalLedger,
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
  .name('atlasbench-v02-local-prepare')
  .description('Lock a multi-task AtlasBench 0.2 local qualification before model calls')
  .requiredOption('--output <directory>', 'new empty qualification directory')
  .requiredOption('--codex-version <version>', 'exact Codex CLI version output')
  .requiredOption('--claude-cli-version <version>', 'exact Claude Code version output')
  .requiredOption('--claude-model <model>', 'Claude CLI model selector')
  .requiredOption('--claude-version <version>', 'exact resolved Claude model ID');

program.action(async (options: Options) => {
  try {
    const output = resolve(options.output);
    await assertEmpty(output);
    const manifestRaw = await readFile(
      resolve('benchmark/v02/development.manifest.json'),
      'utf8',
    );
    const matrixRaw = await readFile(resolve('benchmark/v02/matrix.json'), 'utf8');
    const referenceRaw = await readFile(
      resolve('benchmark/references/atlaspec-v02.md'),
      'utf8',
    );
    const lockfileRaw = await readFile(resolve('package-lock.json'), 'utf8');
    const { stdout: worktreeStatus } = await executeFile(
      'git',
      ['status', '--porcelain', '--untracked-files=no'],
    );
    if (worktreeStatus.trim() !== '') {
      throw new Error('v0.2 local qualification requires a clean tracked worktree.');
    }
    const { stdout } = await executeFile('git', ['rev-parse', 'HEAD']);
    const ledger = buildV02LocalQualificationLedger(
      JSON.parse(manifestRaw) as V02EvaluationManifest,
      JSON.parse(matrixRaw) as V02CorpusMatrix,
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
        source_manifest_raw: manifestRaw,
        matrix_raw: matrixRaw,
        reference_raw: referenceRaw,
        lockfile_raw: lockfileRaw,
        compiler_commit: stdout.trim(),
        generated_at: new Date().toISOString(),
      },
    );
    await mkdir(output, { recursive: true });
    await writeFile(
      resolve(output, 'v02-local-plan.json'),
      serializeV02LocalLedger(ledger),
      'utf8',
    );
    console.log(
      `PREPARED ${ledger.totals.jobs} jobs, ${ledger.totals.expected_runs} runs, ` +
        `${ledger.totals.max_generation_calls} maximum calls; holdout exposed=false`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});

await program.parseAsync(process.argv);

async function assertEmpty(path: string): Promise<void> {
  try {
    if ((await readdir(path)).length > 0) {
      throw new Error(`Output directory is not empty: ${path}`);
    }
  } catch (error) {
    if (!isMissing(error)) throw error;
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
