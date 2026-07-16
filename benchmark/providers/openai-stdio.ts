import { Ajv } from 'ajv';

import {
  GenerationRequestSchema,
  type GenerationRequest,
} from '../protocol.js';
import { generateOpenAIResponse } from './openai-responses.js';
import type { OpenAIAdapterEnvironment } from './openai-responses.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateRequest = ajv.compile<GenerationRequest>(GenerationRequestSchema);

try {
  const raw = await readStdin();
  const value = JSON.parse(raw) as unknown;
  if (!validateRequest(value)) {
    throw new Error(
      `Invalid GenerationRequest: ${ajv.errorsText(validateRequest.errors)}`,
    );
  }
  const response = await generateOpenAIResponse(
    value,
    process.env as unknown as OpenAIAdapterEnvironment,
  );
  process.stdout.write(`${JSON.stringify(response)}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}
