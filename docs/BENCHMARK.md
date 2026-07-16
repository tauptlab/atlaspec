# AtlasBench Evaluation Contract

## Purpose

AtlasBench tests whether a semantic cartographic IR improves reliable map yield
and total generation cost compared with direct renderer authoring by an agent.

The benchmark is a product gate, not a demonstration gallery. Evaluation rules
and thresholds are fixed before implementation results are observed. A failing
or partial result must remain labeled as such.

## Primary hypothesis

For the same model, data, task, and renderer, generating Atlaspec and compiling
it will reduce the first-attempt failure rate by at least 30 percent relative to
the best direct-authoring baseline without reducing map-reading effectiveness.

## Conditions

Each task is run under these conditions:

1. direct MapLibre Style or MapLibre GL JS authoring;
2. direct Vega-Lite geographic specification where the task is representable;
3. Atlaspec generation followed by deterministic compilation;
4. Atlaspec generation with validation diagnostics and one repair opportunity.

Conditions use identical source data and user-visible requirements. Prompts may
contain format-specific reference material, but every input token, retry, tool
call, and compilation failure is included in cost accounting.

## Model strata

The locked evaluation matrix contains at least one model in each stratum:

- small or local model;
- mid-tier hosted model;
- frontier hosted model.

Every task-condition-model tuple uses at least five independent runs. Model
version, temperature, seed where available, prompt digest, tool versions, and
compiler commit are preserved with every result.

## Task corpus

The first complete benchmark contains at least 48 tasks: four map families by
three difficulty levels by four data variants. At least 25 percent of tasks are
held out from compiler development.

Required adversarial variants include:

- missing and non-finite values;
- skewed and heavy-tailed distributions;
- raw counts on unequal-area polygons;
- duplicate and highly clustered points;
- long multilingual labels;
- small mobile viewports;
- low-contrast basemaps;
- features crossing the antimeridian;
- polar or high-latitude data;
- contradictory user constraints;
- unsupported requests that must fail closed.

## Primary endpoint: Reliable Map Yield

A run passes only when all of the following are true on the first attempt:

- the output parses and renders;
- all referenced data fields and sources exist;
- the selected map family is semantically valid for the encoded data;
- legend bins, labels, units, and rendered expressions agree;
- mandatory layers and missing-data treatment are present;
- every task-specific hard constraint passes;
- no error-severity cartographic diagnostic remains.

Reliable Map Yield is the number of passing runs divided by all attempted runs.
Failures are never removed from the denominator because of malformed output,
tool errors caused by generated input, or unsupported renderer features.

## Secondary endpoints

### Cost per accepted map

Total uncached input tokens, output tokens, model charges, tool calls, retries,
and wall-clock time divided by the number of accepted maps. Cached cost is
reported separately and never replaces the uncached result.

### Edit survival rate

After a localized change request, the proportion of previously passing hard
constraints that still pass. The benchmark also records changed lines and
unrelated rendered-region differences.

### Deterministic quality checks

- label-label and label-feature overlap ratio;
- minimum text and symbol size;
- text contrast;
- palette separability under common color-vision-deficiency simulations;
- legend-to-expression concordance;
- monotonicity between quantitative values and symbol area;
- missing-category and missing-value visibility;
- viewport coverage of required features;
- occlusion of protected layers;
- projection and extent validity.

### Human task effectiveness

Blind participants answer locate, compare, rank, and distribution questions.
Accuracy is the primary human measure; completion time and confidence are
secondary measures. Renderer condition and generation method are hidden.

### Expert review

Qualified cartography or GIS reviewers blindly score visual hierarchy,
symbolization fitness, legibility, and misleading representation. Expert scores
are secondary evidence and cannot override failed deterministic constraints.

## Pre-committed success gates

Atlaspec 0.1 is successful only if all of these gates pass:

- at least 30 percent relative reduction in first-attempt failure rate against
  the best baseline;
- at least 25 percent lower cost per accepted map;
- at least 30 percent fewer repair iterations;
- non-inferior human task accuracy with a maximum three-percentage-point margin;
- no worse blind expert score than the best baseline;
- improvement reproduced in at least two of the three model strata;
- the 95 percent confidence interval for the primary improvement excludes zero.

If a baseline already has less than a 10 percent failure rate, the primary gate
for that slice becomes a non-inferiority test plus the cost gate. This exception
is applied per pre-declared slice and not retroactively to the aggregate result.

## Statistical analysis

- paired bootstrap confidence intervals for yield and cost deltas;
- McNemar tests for paired binary pass/fail outcomes;
- paired non-parametric tests for token, latency, and repair-count differences;
- mixed-effects analysis with task and model as grouping factors;
- effect sizes and raw counts reported alongside p-values.

No single LLM judge is accepted as ground truth. Any learned evaluator is
reported separately and calibrated against deterministic checks and blinded
human labels.

## Ablations

The full system is compared with:

- schema validation only;
- semantic types without compiler inference;
- compiler inference without cartographic linting;
- compiler and linter without a repair loop;
- full Atlaspec pipeline.

These runs identify whether improvement comes from the representation,
deterministic defaults, diagnostics, or repeated model calls.

## Reproducibility artifacts

Every published run includes:

- immutable task and data digests;
- exact prompts and model identifiers;
- raw model outputs;
- normalized Atlaspec and backend specifications;
- rendered screenshots;
- validator and linter reports;
- decision traces;
- timing, token, and cost logs;
- the source commit and dependency lockfile.
