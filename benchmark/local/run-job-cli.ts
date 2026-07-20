import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

import { Command } from 'commander';

import { CommandGenerationAdapter } from '../adapters.js';
import { runExperiment } from '../experiment.js';
import type { LocalQualificationLedger } from './bundle.js';
import type { LocalJobReport } from './status.js';

interface Options { bundle: string; job: string }

const executeFile = promisify(execFile);
const program = new Command()
  .name('atlasbench-local-run-job')
  .requiredOption('--bundle <directory>', 'prepared local qualification bundle')
  .requiredOption('--job <id>', 'local job id');

program.action(async (options: Options) => {
  try {
    const bundle = resolve(options.bundle);
    const ledger = JSON.parse(
      await readFile(resolve(bundle, 'local-plan.json'), 'utf8'),
    ) as LocalQualificationLedger;
    const job = ledger.jobs.find((candidate) => candidate.job_id === options.job);
    if (job === undefined) throw new Error(`Unknown local job: ${options.job}`);
    const { stdout } = await executeFile('git', ['rev-parse', 'HEAD']);
    if (stdout.trim() !== ledger.compiler_commit) throw new Error('Compiler commit drift from local plan.');
    if (sha256(await readFile(resolve('package-lock.json'), 'utf8')) !== ledger.lockfile_sha256) {
      throw new Error('Dependency lockfile drift from local plan.');
    }
    const manifestPath = resolve(bundle, job.manifest);
    const manifestRaw = await readFile(manifestPath, 'utf8');
    if (sha256(manifestRaw) !== job.manifest_sha256) throw new Error('Local shard manifest drift.');
    const reportPath = resolve(bundle, job.report);
    try {
      await access(reportPath);
      throw new Error(`Local report already exists: ${reportPath}`);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }

    const providerFile =
      job.agent_id === 'codex'
        ? 'benchmark/providers/codex-cli-stdio.ts'
        : 'benchmark/providers/claude-cli-stdio.ts';
    const adapter = new CommandGenerationAdapter({
      executable: process.execPath,
      args: [
        resolve('node_modules/tsx/dist/cli.mjs'),
        resolve(providerFile),
      ],
    });
    const experiment = await runExperiment(manifestPath, adapter);
    const report: LocalJobReport = {
      schema_version: '0.1',
      job_id: job.job_id,
      experiment,
    };
    await mkdir(dirname(reportPath), { recursive: true });
    const temporary = `${reportPath}.tmp-${process.pid}`;
    await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await rename(temporary, reportPath);
    console.log(`WROTE ${reportPath} runs=${experiment.runs.length}/${job.expected_runs}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});

await program.parseAsync(process.argv);

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
