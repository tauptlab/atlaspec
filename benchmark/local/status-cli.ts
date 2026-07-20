import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Command } from 'commander';

import { inspectLocalQualification } from './status.js';

interface Options { bundle: string; output?: string; requireComplete?: boolean }

const program = new Command()
  .name('atlasbench-local-status')
  .requiredOption('--bundle <directory>', 'local qualification bundle')
  .option('--output <file>', 'write aggregate status JSON')
  .option('--require-complete', 'exit non-zero until all jobs are valid and complete');

program.action(async (options: Options) => {
  try {
    const status = await inspectLocalQualification(resolve(options.bundle));
    const serialized = `${JSON.stringify(status, null, 2)}\n`;
    if (options.output !== undefined) await writeFile(resolve(options.output), serialized, 'utf8');
    process.stdout.write(serialized);
    if (options.requireComplete === true && status.status !== 'complete') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});

await program.parseAsync(process.argv);
