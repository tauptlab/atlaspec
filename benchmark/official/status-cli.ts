import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Command } from 'commander';

import { inspectOfficialBundle } from './status.js';

interface Options {
  bundle: string;
  output?: string;
  requireComplete?: boolean;
}

const program = new Command()
  .name('atlasbench-official-status')
  .description('Verify every report in an official benchmark bundle')
  .requiredOption('--bundle <directory>', 'prepared official bundle')
  .option('--output <file>', 'write the status report as JSON')
  .option('--require-complete', 'exit non-zero for missing or invalid jobs');

program.action(async (options: Options) => {
  try {
    const status = await inspectOfficialBundle(resolve(options.bundle));
    const serialized = `${JSON.stringify(status, null, 2)}\n`;
    if (options.output !== undefined) {
      await writeFile(resolve(options.output), serialized, 'utf8');
    }
    process.stdout.write(serialized);
    if (options.requireComplete === true && status.status !== 'complete') {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});

await program.parseAsync(process.argv);
