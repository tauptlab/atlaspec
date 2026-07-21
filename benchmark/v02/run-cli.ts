import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { Command } from 'commander';

import {
  generateClaudeCliResponse,
  generateCodexCliResponse,
} from '../providers/local-cli.js';
import type { GenerationAdapter } from '../protocol.js';
import { runV02Experiment } from './experiment.js';
import type { V02Condition } from './manifest.js';

interface CliOptions {
  manifest: string;
  output: string;
  provider: 'codex-cli' | 'claude-cli';
  model: string;
  version: string;
  repetitions?: string;
  taskId?: string[];
  condition?: string[];
  atlaspecReference?: string;
  maxOutputTokens: string;
}

const CONDITIONS = new Set<V02Condition>([
  'direct-maplibre',
  'direct-vega-lite',
  'atlaspec-maplibre',
  'atlaspec-vega-lite',
  'atlaspec-repair',
  'vega-capability-negative',
]);

const program = new Command()
  .name('atlasbench-v02-run')
  .description('Run an immutable AtlasBench 0.2 manifest slice through a local CLI adapter')
  .requiredOption('--manifest <file>', 'locked v0.2 manifest')
  .requiredOption('--output <file>', 'new report path; existing files are never overwritten')
  .requiredOption('--provider <provider>', 'codex-cli or claude-cli')
  .requiredOption('--model <id>', 'model selector passed to the local CLI')
  .requiredOption('--version <identity>', 'exact provider-resolved version contract')
  .option('--repetitions <count>', 'override only for development qualification')
  .option('--task-id <id>', 'run one task ID; repeat for multiple tasks', collect)
  .option('--condition <name>', 'run one declared condition; repeat for multiple conditions', collect)
  .option(
    '--atlaspec-reference <path>',
    'Atlaspec reference path relative to the manifest directory; R&D only',
  )
  .option('--max-output-tokens <count>', 'recorded output-token ceiling', '8000');

program.action(async (options: CliOptions) => {
  try {
    if (options.provider !== 'codex-cli' && options.provider !== 'claude-cli') {
      throw new Error(`Unknown provider: ${String(options.provider)}`);
    }
    const output = resolve(options.output);
    await assertMissing(output);
    const repetitions =
      options.repetitions === undefined
        ? undefined
        : positiveInteger(options.repetitions, 'repetitions');
    const maxOutputTokens = positiveInteger(
      options.maxOutputTokens,
      'max-output-tokens',
    );
    const conditions = options.condition?.map(parseCondition);
    const adapter: GenerationAdapter = {
      generate:
        options.provider === 'codex-cli'
          ? generateCodexCliResponse
          : generateClaudeCliResponse,
    };
    const report = await runV02Experiment(resolve(options.manifest), adapter, {
      model: {
        provider: options.provider,
        model: options.model,
        version: options.version,
      },
      sampling: { temperature: 0, max_output_tokens: maxOutputTokens },
      ...(repetitions === undefined ? {} : { repetitions }),
      ...(options.taskId === undefined ? {} : { task_ids: options.taskId }),
      ...(conditions === undefined ? {} : { conditions }),
      ...(options.atlaspecReference === undefined
        ? {}
        : { atlaspec_reference_path: options.atlaspecReference }),
    });
    await mkdir(dirname(output), { recursive: true });
    const temporary = `${output}.tmp-${process.pid}`;
    await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await rename(temporary, output);
    const attempts = report.runs.reduce((total, run) => total + run.attempts.length, 0);
    console.log(`WROTE ${output} runs=${report.runs.length} model_calls=${attempts}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});

await program.parseAsync(process.argv);

function collect(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}

function parseCondition(value: string): V02Condition {
  if (!CONDITIONS.has(value as V02Condition)) {
    throw new Error(`Unknown v0.2 condition: ${value}`);
  }
  return value as V02Condition;
}

function positiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

async function assertMissing(path: string): Promise<void> {
  try {
    await access(path);
    throw new Error(`Output already exists: ${path}`);
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
