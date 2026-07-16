#!/usr/bin/env node

import { resolve } from 'node:path';

import { Command } from 'commander';

import type { Diagnostic, ValidationReport } from './diagnostics.js';
import { loadDocument } from './load.js';
import { validateAtlaspec } from './validate.js';

interface OutputOptions {
  json?: boolean;
}

const program = new Command()
  .name('atlaspec')
  .description('Validate and compile Atlaspec cartographic intent documents.')
  .version('0.0.0');

program
  .command('validate')
  .description('Validate schema and cartographic semantics.')
  .argument('<file>', 'Atlaspec YAML or JSON document')
  .option('--json', 'emit a machine-readable validation report')
  .action(async (file: string, options: OutputOptions) => {
    try {
      const absolutePath = resolve(file);
      const value = await loadDocument(absolutePath);
      const report = validateAtlaspec(value);
      printReport(absolutePath, report, options.json === true);

      if (!report.valid) {
        process.exitCode = 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const report: ValidationReport = {
        valid: false,
        diagnostics: [
          {
            code: 'document.load-failed',
            severity: 'error',
            message,
            path: '/',
          },
        ],
      };
      printReport(resolve(file), report, options.json === true);
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);

function printReport(
  file: string,
  report: ValidationReport,
  json: boolean,
): void {
  if (json) {
    console.log(JSON.stringify({ file, ...report }, null, 2));
    return;
  }

  if (report.diagnostics.length === 0) {
    console.log(`VALID ${file}`);
    return;
  }

  for (const diagnostic of report.diagnostics) {
    console.log(formatDiagnostic(diagnostic));
  }

  const errors = report.diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error',
  ).length;
  const warnings = report.diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'warning',
  ).length;
  console.log(`${report.valid ? 'VALID' : 'INVALID'} ${file} (${errors} errors, ${warnings} warnings)`);
}

function formatDiagnostic(diagnostic: Diagnostic): string {
  return `${diagnostic.severity.toUpperCase()} ${diagnostic.code} ${diagnostic.path} ${diagnostic.message}`;
}
