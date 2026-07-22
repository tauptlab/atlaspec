import { Command } from 'commander';

import { writeV02RenderCalibration } from './render-calibration.js';

interface CliOptions {
  output: string;
  browser?: string;
}

const program = new Command()
  .name('atlasbench-v02-render-calibrate')
  .description('Render development-only compiler references to calibrate label metrics')
  .requiredOption('--output <directory>', 'new calibration directory; existing evidence is never overwritten')
  .option('--browser <file>', 'Chrome or Chromium executable; otherwise use deterministic discovery');

program.action(async (options: CliOptions) => {
  try {
    const report = await writeV02RenderCalibration(options.output, {
      ...(options.browser === undefined ? {} : { browser_path: options.browser }),
    });
    console.log(
      `WROTE ${options.output} tasks=${report.summary.tasks} passed=${report.summary.passed} failed=${report.summary.failed} holdout_exposed=${report.holdout_exposed}`,
    );
    if (report.summary.failed > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});

await program.parseAsync(process.argv);
