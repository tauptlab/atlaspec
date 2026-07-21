import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

import { Command } from 'commander';

import {
  generateClaudeCliResponse,
  generateCodexCliResponse,
} from '../../providers/local-cli.js';
import type { GenerationAdapter } from '../../protocol.js';
import { runV02Experiment } from '../experiment.js';
import type { V02LocalQualificationLedger } from './bundle.js';
import type { V02LocalJobReport } from './status.js';

interface Options {
  bundle: string;
  job: string;
}

const executeFile = promisify(execFile);
const program = new Command()
  .name('atlasbench-v02-local-run-job')
  .requiredOption('--bundle <directory>', 'prepared v0.2 local qualification bundle')
  .requiredOption('--job <id>', 'job id such as codex/basic');

program.action(async (options: Options) => {
  try {
    const bundle = resolve(options.bundle);
    const ledger = JSON.parse(
      await readFile(resolve(bundle, 'v02-local-plan.json'), 'utf8'),
    ) as V02LocalQualificationLedger;
    const job = ledger.jobs.find((candidate) => candidate.job_id === options.job);
    if (job === undefined) throw new Error(`Unknown v0.2 local job: ${options.job}`);
    const agent = ledger.agents.find((candidate) => candidate.id === job.agent_id);
    if (agent === undefined) throw new Error(`Agent missing from ledger: ${job.agent_id}`);

    const { stdout } = await executeFile('git', ['rev-parse', 'HEAD']);
    if (stdout.trim() !== ledger.compiler_commit) {
      throw new Error('Compiler commit drift from v0.2 local plan.');
    }
    if (sha256(await readFile(resolve('package-lock.json'), 'utf8')) !== ledger.lockfile_sha256) {
      throw new Error('Dependency lockfile drift from v0.2 local plan.');
    }
    const manifestPath = resolve(ledger.source.manifest);
    const manifestRaw = await readFile(manifestPath, 'utf8');
    if (sha256(manifestRaw) !== ledger.source.manifest_sha256) {
      throw new Error('Development manifest drift from v0.2 local plan.');
    }
    if (sha256(await readFile(resolve(ledger.source.matrix), 'utf8')) !== ledger.source.matrix_sha256) {
      throw new Error('Corpus matrix drift from v0.2 local plan.');
    }

    const reportPath = resolve(bundle, job.report);
    await assertMissing(reportPath);
    const adapter: GenerationAdapter = {
      generate:
        agent.id === 'codex'
          ? generateCodexCliResponse
          : generateClaudeCliResponse,
    };
    const experiment = await runV02Experiment(manifestPath, adapter, {
      model: structuredClone(agent.model),
      sampling: { temperature: 0, max_output_tokens: 8000 },
      repetitions: ledger.qualification.repetitions,
      task_ids: job.task_ids,
      on_run_complete: (run, completed) => {
        console.log(
          `PROGRESS ${job.job_id} ${completed}/${job.expected_runs} ` +
            `${run.task_id}/${run.condition}/${run.repetition} accepted=${run.final_accepted}`,
        );
      },
    });
    const report: V02LocalJobReport = {
      schema_version: '0.2',
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

async function assertMissing(path: string): Promise<void> {
  try {
    await access(path);
    throw new Error(`Local report already exists: ${path}`);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
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
