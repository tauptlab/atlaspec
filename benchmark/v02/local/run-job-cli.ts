import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

import { Command } from 'commander';

import {
  generateClaudeCliResponse,
  generateCodexCliResponse,
} from '../../providers/local-cli.js';
import type { GenerationAdapter } from '../../protocol.js';
import {
  runV02Experiment,
  summarizeV02Runs,
  type V02RunRecord,
} from '../experiment.js';
import type { V02EvaluationManifest } from '../manifest.js';
import type { V02LocalQualificationLedger } from './bundle.js';
import {
  checkpointReportPath,
  verifyV02LocalJob,
  type V02LocalJobReport,
} from './status.js';

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
    const manifest = JSON.parse(manifestRaw) as V02EvaluationManifest;
    if (sha256(manifestRaw) !== ledger.source.manifest_sha256) {
      throw new Error('Development manifest drift from v0.2 local plan.');
    }
    if (sha256(await readFile(resolve(ledger.source.matrix), 'utf8')) !== ledger.source.matrix_sha256) {
      throw new Error('Corpus matrix drift from v0.2 local plan.');
    }

    const reportPath = resolve(bundle, job.report);
    await assertMissing(reportPath);
    const checkpointPath = resolve(bundle, checkpointReportPath(job.report));
    const priorReport = await readCheckpoint(checkpointPath);
    if (priorReport !== undefined) {
      const checkpointStatus = verifyV02LocalJob(
        ledger,
        job,
        manifest,
        priorReport,
        { allowPartial: true },
      );
      if (checkpointStatus.state === 'invalid') {
        throw new Error(
          `Invalid checkpoint for ${job.job_id}: ${checkpointStatus.diagnostics.join('; ')}`,
        );
      }
      console.log(
        `RESUME ${job.job_id} completed=${priorReport.experiment.runs.length}/${job.expected_runs}`,
      );
    }
    const adapter: GenerationAdapter = {
      generate:
        agent.id === 'codex'
          ? generateCodexCliResponse
          : generateClaudeCliResponse,
    };
    const generatedAt = priorReport?.experiment.generated_at ?? new Date().toISOString();
    const reportFor = (runs: readonly V02RunRecord[]): V02LocalJobReport => ({
      schema_version: '0.2',
      job_id: job.job_id,
      experiment: {
        schema_version: '0.2',
        suite: manifest.suite,
        compiler_commit: ledger.compiler_commit,
        generated_at: generatedAt,
        manifest_sha256: ledger.source.manifest_sha256,
        model: structuredClone(agent.model),
        sampling: { temperature: 0, max_output_tokens: 8000 },
        execution_order: 'balanced',
        runs: [...runs],
        summaries: summarizeV02Runs(runs),
      },
    });
    const experiment = await runV02Experiment(manifestPath, adapter, {
      model: structuredClone(agent.model),
      sampling: { temperature: 0, max_output_tokens: 8000 },
      repetitions: ledger.qualification.repetitions,
      task_ids: job.task_ids,
      prior_runs: priorReport?.experiment.runs ?? [],
      on_run_complete: async (run, completed, allRuns) => {
        await writeAtomic(checkpointPath, reportFor(allRuns));
        console.log(
          `PROGRESS ${job.job_id} ${completed}/${job.expected_runs} ` +
            `${run.task_id}/${run.condition}/${run.repetition} accepted=${run.final_accepted}`,
        );
      },
    });
    const report = reportFor(experiment.runs);
    await writeAtomic(reportPath, report);
    await rm(checkpointPath, { force: true });
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

async function readCheckpoint(path: string): Promise<V02LocalJobReport | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as V02LocalJobReport;
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

async function writeAtomic(path: string, report: V02LocalJobReport): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
