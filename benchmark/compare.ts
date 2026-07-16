import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Command, Option } from 'commander';

import {
  CommandGenerationAdapter,
  ReplayGenerationAdapter,
} from './adapters.js';
import { analyzeComparison } from './analysis.js';
import { runExperiment } from './experiment.js';

interface CompareOptions {
  manifest: string;
  replay?: string;
  adapter?: string;
  adapterArg: string[];
  report?: string;
  requireAutomatedPass?: boolean;
}

const program = new Command()
  .name('atlasbench')
  .description('Run an auditable Atlaspec comparison experiment')
  .requiredOption('-m, --manifest <file>', 'comparison experiment manifest')
  .option('--replay <file>', 'replay recorded protocol responses')
  .option('--adapter <executable>', 'external generation adapter executable')
  .addOption(
    new Option(
      '--adapter-arg <value>',
      'argument passed directly to the adapter without shell parsing',
    )
      .argParser(collect)
      .default([]),
  )
  .option('-r, --report <file>', 'write the complete JSON result')
  .option(
    '--require-automated-pass',
    'exit non-zero unless the automated primary and cost gates pass',
  );

program.action(async (options: CompareOptions) => {
  try {
    if ((options.replay === undefined) === (options.adapter === undefined)) {
      throw new Error('Specify exactly one of --replay or --adapter.');
    }
    if (options.replay !== undefined && options.adapterArg.length > 0) {
      throw new Error('--adapter-arg cannot be used with --replay.');
    }

    const adapter =
      options.replay !== undefined
        ? await ReplayGenerationAdapter.fromFile(resolve(options.replay))
        : new CommandGenerationAdapter({
            executable: options.adapter!,
            args: options.adapterArg,
          });
    const experiment = await runExperiment(options.manifest, adapter);
    const analysis = analyzeComparison(experiment);
    const result = {
      schema_version: '0.1',
      experiment,
      automated_analysis: analysis,
    } as const;
    const serialized = `${JSON.stringify(result, null, 2)}\n`;

    if (options.report !== undefined) {
      const reportPath = resolve(options.report);
      await writeFile(reportPath, serialized, 'utf8');
      console.error(`WROTE ${reportPath}`);
    }
    process.stdout.write(serialized);

    if (options.requireAutomatedPass === true && analysis.status !== 'pass') {
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
