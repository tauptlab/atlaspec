import { Ajv } from 'ajv';

import { GenerationRequestSchema, type GenerationRequest } from '../protocol.js';
import { generateCodexCliResponse } from './local-cli.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile<GenerationRequest>(GenerationRequestSchema);

try {
  const raw = await readStdin();
  const value = JSON.parse(raw) as unknown;
  if (!validate(value)) {
    throw new Error(`Invalid GenerationRequest: ${ajv.errorsText(validate.errors)}`);
  }
  process.stdout.write(`${JSON.stringify(await generateCodexCliResponse(value))}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}
