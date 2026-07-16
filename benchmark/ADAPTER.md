# Generation adapter contract

AtlasBench deliberately does not embed a specific model SDK. A generation
adapter is an executable that receives one `GenerationRequest` JSON object on
standard input and writes one `GenerationResponse` JSON object to standard
output. Provider logs belong on standard error.

The authoritative strict schemas are in `benchmark/protocol.ts`. The request
contains the complete prompt, model identity, sampling settings, source data,
and SHA-256 digests. The response must contain the raw generated artifact plus
uncached token usage, provider charge in USD, latency, tool-call count, and
finish reason. Unknown fields, negative measurements, missing accounting, and a
mismatched request identifier fail closed.

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
