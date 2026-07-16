import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Command } from 'commander';

import { runSuite } from './suite.js';

interface RunOptions {
  manifest: string;
  json?: boolean;
  report?: string;
}

const program = new Command()
  .name('atlasbench')
  .requiredOption('-m, --manifest <file>', 'benchmark manifest')
  .option('--json', 'print the full machine-readable report')
  .option('-r, --report <file>', 'write the report to a JSON file');

program.action(async (options: RunOptions) => {
  try {
    const report = await runSuite(options.manifest);
    const serialized = `${JSON.stringify(report, null, 2)}\n`;

    if (options.report !== undefined) {
      const reportPath = resolve(options.report);
      await writeFile(reportPath, serialized, 'utf8');
      console.error(`WROTE ${reportPath}`);
    }

    if (options.json === true) {
      process.stdout.write(serialized);
    } else {
      console.log(
        `${report.suite}: ${report.accepted}/${report.attempted} accepted ` +
          `(Reliable Map Yield ${(report.reliable_map_yield * 100).toFixed(1)}%)`,
      );
    }

    if (report.accepted !== report.attempted) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});

await program.parseAsync(process.argv);
