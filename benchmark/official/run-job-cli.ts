import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

import { Command, Option } from 'commander';

import { CommandGenerationAdapter } from '../adapters.js';
import { analyzeComparison } from '../analysis.js';
import { runExperiment } from '../experiment.js';
import type { OfficialLedger } from './plan.js';
import { verifyOfficialJob } from './status.js';

interface Options {
  bundle: string;
  job: string;
  adapter: string;
  adapterArg: string[];
}

const executeFile = promisify(execFile);
const program = new Command()
  .name('atlasbench-official-run-job')
  .description('Run one pinned official benchmark shard')
  .requiredOption('--bundle <directory>', 'prepared official bundle')
  .requiredOption('--job <id>', 'job id from official-plan.json')
  .requiredOption('--adapter <executable>', 'generation adapter executable')
  .addOption(
    new Option('--adapter-arg <value>', 'adapter argument without shell parsing')
      .argParser(collect)
      .default([]),
  );

program.action(async (options: Options) => {
  try {
    const bundleDirectory = resolve(options.bundle);
    const ledger = JSON.parse(
      await readFile(resolve(bundleDirectory, 'official-plan.json'), 'utf8'),
    ) as OfficialLedger;
    const job = ledger.jobs.find((candidate) => candidate.job_id === options.job);
    if (job === undefined) throw new Error(`Unknown official job: ${options.job}`);

    const { stdout } = await executeFile('git', ['rev-parse', 'HEAD']);
    if (stdout.trim() !== ledger.compiler_commit) {
      throw new Error(
        `Compiler commit drift: plan=${ledger.compiler_commit} current=${stdout.trim()}.`,
      );
    }
    const lockfileRaw = await readFile(resolve('package-lock.json'), 'utf8');
    if (sha256(lockfileRaw) !== ledger.lockfile_sha256) {
      throw new Error('Dependency lockfile digest differs from the official plan.');
    }

    const manifestPath = resolve(bundleDirectory, job.manifest);
    const manifestRaw = await readFile(manifestPath, 'utf8');
    if (sha256(manifestRaw) !== job.manifest_sha256) {
      throw new Error(`Shard manifest digest differs from the official plan: ${job.job_id}.`);
    }
    const reportPath = resolve(bundleDirectory, job.report);
    try {
      await access(reportPath);
      throw new Error(`Official report already exists: ${reportPath}`);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }

    const adapter = new CommandGenerationAdapter({
      executable: options.adapter,
      args: options.adapterArg,
    });
    const experiment = await runExperiment(manifestPath, adapter);
    const report = {
      schema_version: '0.1' as const,
      experiment,
      automated_analysis: analyzeComparison(experiment),
    };
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    await mkdir(dirname(reportPath), { recursive: true });
    const temporary = `${reportPath}.tmp-${process.pid}`;
    await writeFile(temporary, serialized, 'utf8');
    await rename(temporary, reportPath);

    const status = verifyOfficialJob(ledger, job, manifestRaw, report);
    console.log(
      `WROTE ${reportPath} state=${status.state} runs=${status.observed_runs}/${job.expected_runs} charge_usd=${status.charge_usd}`,
    );
    if (status.state !== 'complete') {
      for (const diagnostic of status.diagnostics) console.error(diagnostic);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});

await program.parseAsync(process.argv);

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
