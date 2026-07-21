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
import type { GenerationAdapter, ModelIdentity } from '../../protocol.js';
import {
  runV02Experiment,
  summarizeV02Runs,
  type V02ExperimentReport,
  type V02RunRecord,
} from '../experiment.js';
import {
  buildReferenceLayoutSchedule,
  type ReferenceLayoutArm,
} from './reference-layout.js';

interface PlanAgent {
  id: string;
  provider: 'codex-cli' | 'claude-cli';
  model: string;
  version: string;
  output: string;
}

interface ReferenceLayoutPlan {
  schema_version: '0.2-rnd.2';
  experiment_id: string;
  source: {
    manifest: string;
    manifest_sha256: string;
    lockfile_sha256: string;
    references: Array<{ path: string; sha256: string }>;
  };
  agents: PlanAgent[];
  task_ids: string[];
  arms: ReferenceLayoutArm[];
  repetitions: number;
}

interface ReferenceLayoutReport {
  schema_version: '0.2-rnd.2';
  experiment_id: string;
  plan_sha256: string;
  compiler_commit: string;
  generated_at: string;
  agent: PlanAgent;
  execution_order: 'counterbalanced-reference-layout';
  runs: V02RunRecord[];
  summaries: V02ExperimentReport['summaries'];
}

const executeFile = promisify(execFile);
const program = new Command()
  .name('atlasbench-v02-reference-layout-rnd')
  .requiredOption('--plan <file>', 'precommitted reference-layout R&D plan')
  .requiredOption('--agent <id>', 'agent ID declared in the plan');

program.action(async (options: { plan: string; agent: string }) => {
  try {
    const planPath = resolve(options.plan);
    const planRaw = await readFile(planPath, 'utf8');
    const plan = JSON.parse(planRaw) as ReferenceLayoutPlan;
    if (plan.schema_version !== '0.2-rnd.2') throw new Error('Unsupported R&D plan.');
    if (plan.repetitions !== 1) {
      throw new Error('Reference-layout R&D runner currently requires exactly one repetition.');
    }
    const agent = plan.agents.find((candidate) => candidate.id === options.agent);
    if (agent === undefined) throw new Error(`Unknown plan agent: ${options.agent}`);
    await verifySources(plan);

    const compilerCommit = (await executeFile('git', ['rev-parse', 'HEAD'])).stdout.trim();
    const output = resolve(agent.output);
    await assertMissing(output);
    const checkpoint = `${output}.checkpoint.json`;
    const prior = await readCheckpoint(checkpoint);
    if (
      prior !== undefined &&
      (prior.compiler_commit !== compilerCommit || prior.plan_sha256 !== sha256(planRaw))
    ) {
      throw new Error('Checkpoint provenance does not match the current plan and commit.');
    }
    const runs = [...(prior?.runs ?? [])];
    const completed = new Set(runs.map((run) => run.run_id));
    const adapter: GenerationAdapter = {
      generate:
        agent.provider === 'codex-cli'
          ? generateCodexCliResponse
          : generateClaudeCliResponse,
    };
    const schedule = buildReferenceLayoutSchedule(
      plan.task_ids,
      plan.arms,
      plan.repetitions,
    );
    const generatedAt = prior?.generated_at ?? new Date().toISOString();

    for (const cell of schedule) {
      const expectedRunId = `${plan.experiment_id}/${cell.task_id}/atlaspec-maplibre/${cell.repetition}/${cell.arm.id}`;
      if (completed.has(expectedRunId)) continue;
      const result = await runV02Experiment(resolve(plan.source.manifest), adapter, {
        model: modelIdentity(agent),
        sampling: { temperature: 0, max_output_tokens: 8000 },
        repetitions: 1,
        task_ids: [cell.task_id],
        conditions: ['atlaspec-maplibre'],
        atlaspec_reference_path: cell.arm.reference_path_from_manifest,
        prompt_layout: cell.arm.prompt_layout,
        run_variant: cell.arm.id,
      });
      const run = result.runs[0]!;
      run.run_id = expectedRunId;
      for (const attempt of run.attempts) {
        const suffix = `/${attempt.request.attempt}`;
        attempt.request.request_id = `${expectedRunId}${suffix}`;
        if (attempt.response !== undefined) attempt.response.request_id = attempt.request.request_id;
      }
      runs.push(run);
      completed.add(run.run_id);
      await writeAtomic(checkpoint, reportFor(plan, planRaw, agent, compilerCommit, generatedAt, runs));
      console.log(
        `PROGRESS ${agent.id} ${runs.length}/${schedule.length} task=${cell.task_id} ` +
          `arm=${cell.arm.id} position=${cell.position} accepted=${run.final_accepted}`,
      );
    }

    await writeAtomic(
      output,
      reportFor(plan, planRaw, agent, compilerCommit, generatedAt, runs),
    );
    await rm(checkpoint, { force: true });
    console.log(`WROTE ${output} runs=${runs.length}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});

await program.parseAsync(process.argv);

function reportFor(
  plan: ReferenceLayoutPlan,
  planRaw: string,
  agent: PlanAgent,
  compilerCommit: string,
  generatedAt: string,
  runs: readonly V02RunRecord[],
): ReferenceLayoutReport {
  return {
    schema_version: '0.2-rnd.2',
    experiment_id: plan.experiment_id,
    plan_sha256: sha256(planRaw),
    compiler_commit: compilerCommit,
    generated_at: generatedAt,
    agent: structuredClone(agent),
    execution_order: 'counterbalanced-reference-layout',
    runs: [...runs],
    summaries: summarizeV02Runs(runs),
  };
}

async function verifySources(plan: ReferenceLayoutPlan): Promise<void> {
  const { stdout } = await executeFile('git', ['status', '--porcelain', '--untracked-files=no']);
  if (stdout.trim() !== '') throw new Error('Tracked worktree must be clean.');
  await verifyDigest(plan.source.manifest, plan.source.manifest_sha256);
  await verifyDigest('package-lock.json', plan.source.lockfile_sha256);
  for (const reference of plan.source.references) {
    await verifyDigest(reference.path, reference.sha256);
  }
  const declaredReferences = new Set(
    plan.source.references.map((reference) => resolve(reference.path)),
  );
  const manifestDirectory = dirname(resolve(plan.source.manifest));
  for (const arm of plan.arms) {
    if (!declaredReferences.has(resolve(manifestDirectory, arm.reference_path_from_manifest))) {
      throw new Error(`Arm reference is not digest-locked: ${arm.id}`);
    }
  }
}

async function verifyDigest(path: string, expected: string): Promise<void> {
  const actual = sha256(await readFile(resolve(path), 'utf8'));
  if (actual !== expected) throw new Error(`Source digest mismatch: ${path}`);
}

function modelIdentity(agent: PlanAgent): ModelIdentity {
  return { provider: agent.provider, model: agent.model, version: agent.version };
}

async function readCheckpoint(path: string): Promise<ReferenceLayoutReport | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as ReferenceLayoutReport;
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

async function assertMissing(path: string): Promise<void> {
  try {
    await access(path);
    throw new Error(`Output already exists: ${path}`);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

async function writeAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
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
