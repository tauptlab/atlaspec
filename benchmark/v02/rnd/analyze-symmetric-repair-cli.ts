import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Command } from 'commander';

import type { V02ExperimentReport } from '../experiment.js';
import { analyzeSymmetricRepair } from './symmetric-repair.js';

const program = new Command()
  .name('atlasbench-v02-analyze-symmetric-repair')
  .description('Analyze paired direct and Atlaspec one-repair R&D conditions')
  .requiredOption('--report <file>', 'v0.2 experiment report')
  .option('--output <file>', 'write JSON analysis instead of stdout');

program.action(async (options: { report: string; output?: string }) => {
  const report = JSON.parse(
    await readFile(resolve(options.report), 'utf8'),
  ) as V02ExperimentReport;
  const rendered = `${JSON.stringify(analyzeSymmetricRepair(report), null, 2)}\n`;
  if (options.output === undefined) {
    process.stdout.write(rendered);
    return;
  }
  await writeFile(resolve(options.output), rendered, 'utf8');
  console.log(`WROTE ${resolve(options.output)}`);
});

await program.parseAsync(process.argv);
