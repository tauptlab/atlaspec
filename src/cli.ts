#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Command } from 'commander';
import { stringify } from 'yaml';

import type { Diagnostic, ValidationReport } from './diagnostics.js';
import { loadDocument } from './load.js';
import { compileMapLibre } from './maplibre.js';
import { upgradeAtlaspec } from './migrate.js';
import type { AtlaspecDocument } from './schema.js';
import { validateAtlaspec } from './validate.js';
import { compileVegaLite } from './vega-lite.js';

interface OutputOptions {
  json?: boolean;
}

interface CompileOptions {
  output?: string;
  target: string;
}

type CompileTarget = 'maplibre' | 'vega-lite';

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

program
  .command('compile')
  .description('Compile a valid Atlaspec document to a renderer artifact.')
  .argument('<file>', 'Atlaspec YAML or JSON document')
  .option('-o, --output <file>', 'write the renderer artifact to a file')
  .option(
    '--target <target>',
    'renderer target: maplibre or vega-lite',
    'maplibre',
  )
  .action(async (file: string, options: CompileOptions) => {
    try {
      const absolutePath = resolve(file);
      const value = await loadDocument(absolutePath);
      const target = parseTarget(options.target);
      const result =
        target === 'maplibre'
          ? compileMapLibre(value)
          : compileVegaLite(value);
      if (!result.ok) {
        for (const diagnostic of result.diagnostics) {
          console.error(formatDiagnostic(diagnostic));
        }
        process.exitCode = 1;
        return;
      }

      const artifact = 'style' in result ? result.style : result.spec;
      const output = `${JSON.stringify(artifact, null, 2)}\n`;
      if (options.output === undefined) {
        process.stdout.write(output);
      } else {
        const outputPath = resolve(options.output);
        await writeFile(outputPath, output, 'utf8');
        console.log(`WROTE ${outputPath}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`ERROR document.load-failed / ${message}`);
      process.exitCode = 1;
    }
  });

program
  .command('upgrade')
  .description('Upgrade an Atlaspec 0.1 document to canonical Atlaspec 0.2 YAML.')
  .argument('<file>', 'Atlaspec YAML or JSON document')
  .option('-o, --output <file>', 'write upgraded YAML to a file')
  .action(async (file: string, options: { output?: string }) => {
    try {
      const absolutePath = resolve(file);
      const value = await loadDocument(absolutePath);
      const report = validateAtlaspec(value);
      if (!report.valid) {
        for (const diagnostic of report.diagnostics) {
          console.error(formatDiagnostic(diagnostic));
        }
        process.exitCode = 1;
        return;
      }

      const output = stringify(
        upgradeAtlaspec(value as AtlaspecDocument),
        { lineWidth: 0 },
      );
      if (options.output === undefined) {
        process.stdout.write(output);
      } else {
        const outputPath = resolve(options.output);
        await writeFile(outputPath, output, 'utf8');
        console.log(`WROTE ${outputPath}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`ERROR document.upgrade-failed / ${message}`);
      process.exitCode = 1;
    }
  });

program
  .command('capabilities')
  .description('Check whether a document is representable by a compiler target.')
  .argument('<file>', 'Atlaspec YAML or JSON document')
  .requiredOption('--target <target>', 'renderer target: maplibre or vega-lite')
  .action(async (file: string, options: { target: string }) => {
    try {
      const target = parseTarget(options.target);
      const value = await loadDocument(resolve(file));
      const result =
        target === 'maplibre'
          ? compileMapLibre(value)
          : compileVegaLite(value);
      console.log(
        JSON.stringify(
          {
            target,
            supported: result.ok,
            diagnostics: result.diagnostics,
          },
          null,
          2,
        ),
      );
      if (!result.ok) process.exitCode = 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`ERROR capabilities.failed / ${message}`);
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

function parseTarget(value: string): CompileTarget {
  if (value === 'maplibre' || value === 'vega-lite') return value;
  throw new Error(
    `Unknown compiler target '${value}'. Expected maplibre or vega-lite.`,
  );
}
