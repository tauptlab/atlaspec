# AtlasBench 48-task corpus

This directory freezes the first complete structural task matrix:

- four map families;
- three difficulty levels;
- four data variants;
- 48 unique cells;
- 36 development tasks and 12 holdout tasks;
- five independent repetitions per task-condition-model tuple.

The holdout rotation assigns exactly one variant to every family-difficulty
pair and uses each variant three times. Holdout tasks must not be used to tune
the Atlaspec schema, linter, compiler defaults, prompts, or deterministic
checks. Once a holdout result is inspected, changes motivated by that result
must be evaluated on a newly frozen holdout corpus.

Generated artifacts are deterministic:

```powershell
npm run corpus:generate
npm run corpus:check
```

`corpus:check` compares the matrix, both manifests, and all 16 shared datasets
against the generator output. CI and release verification should use the check
command, not regenerate files silently.

## Prepare a model run

Frozen manifests contain model placeholders and must never be edited in place.
Materialize a development run outside this directory:

```powershell
npm run corpus:prepare -- `
  --input benchmark/corpus/development.manifest.json `
  --output work/development.openai.json `
  --provider openai `
  --model '<model ID sent to the API>' `
  --version '<exact model ID expected in the response>'
```

The OpenAI adapter rejects the run if the provider-resolved model differs from
`--version`. Preparing `holdout.manifest.json` additionally requires
`--acknowledge-holdout-exposure`; using that flag means the frozen holdout has
been consumed for the stated model and compiler version.

## Data variants

- `canonical`: well-formed moderate values;
- `missing-values`: omitted encoded properties that must not become zero;
- `distribution-stress`: skew, repeated observations, and tight clusters;
- `geographic-stress`: high latitude, antimeridian-adjacent geometry, and long
  Korean and English labels.

## Current evidence boundary

The matrix and generation inputs are ready, but this alone is not a completed
benchmark. Current renderer-depth evaluation verifies parsing, compilation,
required layer or mark types, and Atlaspec decision traces. More task-specific
deterministic checks are still required for missing-value visibility, legend
concordance, label overlap, viewport coverage, contrast, and projection
behavior before the 48-task result can support the full product claim.
