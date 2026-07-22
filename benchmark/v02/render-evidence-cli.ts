import { Command } from 'commander';

import { writeV02RenderEvidence } from './render-evidence.js';

interface CliOptions {
  report: string[];
  output: string;
  browser?: string;
}

const program = new Command()
  .name('atlasbench-v02-render')
  .description('Render accepted MapLibre and Vega-Lite conditions from immutable AtlasBench 0.2 reports')
  .requiredOption('--report <file>', 'source experiment or job report; repeat for multiple files', collect)
  .requiredOption('--output <directory>', 'new evidence directory; existing evidence is never overwritten')
  .option('--browser <file>', 'Chrome or Chromium executable; otherwise use deterministic discovery');

program.action(async (options: CliOptions) => {
  try {
    const report = await writeV02RenderEvidence(options.report, options.output, {
      ...(options.browser === undefined ? {} : { browser_path: options.browser }),
    });
    console.log(
      `WROTE ${options.output} rendered=${report.summary.rendered} passed=${report.summary.passed} failed=${report.summary.failed} skipped_source_failures=${report.summary.skipped_source_failures}`,
    );
    if (report.summary.rendered === 0 || report.summary.failed > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});

await program.parseAsync(process.argv);

function collect(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}
