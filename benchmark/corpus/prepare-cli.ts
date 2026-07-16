import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

import { Command } from 'commander';

import { prepareManifest, rebaseManifestPaths } from './prepare.js';

interface Options {
  input: string;
  output: string;
  provider: string;
  model: string;
  version: string;
  acknowledgeHoldoutExposure?: boolean;
}

const program = new Command()
  .name('atlasbench-corpus-prepare')
  .requiredOption('-i, --input <file>', 'frozen corpus manifest')
  .requiredOption('-o, --output <file>', 'prepared run manifest')
  .requiredOption('--provider <name>', 'provider identifier')
  .requiredOption('--model <id>', 'model ID sent to the provider')
  .requiredOption('--version <id>', 'exact model ID expected in the response')
  .option(
    '--acknowledge-holdout-exposure',
    'confirm that inspecting this holdout consumes the frozen holdout',
  );

program.action(async (options: Options) => {
  try {
    const input = resolve(options.input);
    const output = resolve(options.output);
    if (input === output) {
      throw new Error('Prepared output must not overwrite the frozen input.');
    }
    const corpusRoot = resolve('benchmark', 'corpus');
    const relativeToCorpus = relative(corpusRoot, output);
    if (
      relativeToCorpus === '' ||
      (!relativeToCorpus.startsWith('..') && !isAbsolute(relativeToCorpus))
    ) {
      throw new Error('Prepared output must be outside benchmark/corpus.');
    }

    const source = JSON.parse(await readFile(input, 'utf8')) as unknown;
    const prepared = prepareManifest(source, {
      provider: options.provider,
      model: options.model,
      version: options.version,
      ...(options.acknowledgeHoldoutExposure === true
        ? { acknowledge_holdout_exposure: true }
        : {}),
    });
    const rebased = rebaseManifestPaths(prepared, dirname(input), dirname(output));
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(rebased, null, 2)}\n`, 'utf8');
    console.log(`WROTE ${output}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
});

await program.parseAsync(process.argv);
