# Generation adapter contract

AtlasBench deliberately does not embed a specific model SDK. A generation
adapter is an executable that receives one `GenerationRequest` JSON object on
standard input and writes one `GenerationResponse` JSON object to standard
output. Provider logs belong on standard error.

The authoritative strict schemas are in `benchmark/protocol.ts`. The request
contains the complete prompt, model identity, sampling settings, source data,
and SHA-256 digests. The response must contain the raw generated artifact, the
provider-resolved model identity, uncached and cached token usage, the locked
input/cached/output rates used to calculate the USD charge, latency, tool-call
count, and finish reason. Unknown fields, negative measurements, missing
accounting, and a mismatched request identifier fail closed.

AtlasBench starts the executable directly without a command shell. Repeat
arguments when needed:

```powershell
npm run atlasbench -- `
  --manifest benchmark/comparison.example.json `
  --adapter node `
  --adapter-arg=path/to/provider-adapter.mjs `
  --report work/comparison-report.json
```

The adapter owns provider authentication. Secrets must be read from its process
environment and must never appear in the response, report, manifest, command
arguments, or repository. The adapter should report the exact immutable model
version returned by the provider; it must not silently substitute another
model.

## Replay mode

A replay file is a JSON array of complete `GenerationResponse` objects keyed by
the deterministic request identifiers found in a previous report. Replay mode
performs no model calls and is intended for evaluator regression, independent
review, and exact analysis reruns:

```powershell
npm run atlasbench -- `
  --manifest benchmark/comparison.example.json `
  --replay work/responses.json `
  --report work/replayed-report.json
```

The experiment report always retains rejected attempts and transport errors.
For `atlaspec-repair`, the runner sends at most one additional request containing
the prior artifact and deterministic diagnostics. Other conditions are never
given an undeclared retry.

## OpenAI Responses reference adapter

The checked-in reference adapter uses the Responses API without storing API
responses server-side. It selects `message` output items and their
`output_text` content instead of assuming the first output item is text. It
also rejects a provider-resolved model that differs from the manifest's locked
`model.version`.

Configure authentication and a price card in the process environment:

```powershell
$env:OPENAI_API_KEY = '<not committed>'
$env:ATLASBENCH_OPENAI_INPUT_USD_PER_1M = '<locked rate>'
$env:ATLASBENCH_OPENAI_CACHED_INPUT_USD_PER_1M = '<locked rate>'
$env:ATLASBENCH_OPENAI_OUTPUT_USD_PER_1M = '<locked rate>'
$env:ATLASBENCH_OPENAI_PRICING_SOURCE = '<URL or dated price-card digest>'

npm run atlasbench -- `
  --manifest benchmark/comparison.example.json `
  --adapter node `
  --adapter-arg=node_modules/tsx/dist/cli.mjs `
  --adapter-arg=benchmark/providers/openai-stdio.ts `
  --report work/openai-comparison.json
```

Use an immutable model snapshot in `model.version`. The adapter treats `seed`
as unsupported and fails rather than silently ignoring it. Sampling controls
that are actually sent are retained in the manifest and every request record.
