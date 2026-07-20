# AtlasBench 0.2 Evaluation Contract

## Purpose

AtlasBench 0.2 evaluates whether semantic composition remains reliable when an
agent must create and edit multi-layer maps, and whether the same intent can be
compiled to more than one renderer without silent semantic loss.

This contract is fixed before v0.2 implementation results are measured. The
consumed v0.1 holdout is not reused as v0.2 evidence.

## Primary hypotheses

### H1: multi-layer generation reliability

For the same model, data, and task, authoring Atlaspec 0.2 and compiling it to
MapLibre reduces first-attempt failure rate by at least 30% relative to direct
MapLibre multi-layer authoring.

### H2: renderer portability

At least 95% of v0.2 tasks declared representable by both backends compile to
valid MapLibre and warning-free Vega-Lite while preserving the same required
fields, layer purposes, legends, and map-reading intent.

### H3: localized edit survival

After a request that changes one Atlaspec layer, at least 95% of unrelated
compiled layer contracts remain byte-identical and all previously passing hard
constraints outside the target layer survive.

## Fresh corpus

Create a new `atlasbench-v02-48` corpus rather than extending or sampling the
v0.1 corpus.

- 4 composition archetypes;
- 3 difficulty levels;
- 4 data/adversarial variants;
- 48 total tasks;
- 36 development tasks;
- 12 deterministically rotated holdout tasks;
- 5 independent repetitions for every task-condition-model tuple.

The four initial composition archetypes are:

1. choropleth plus proportional symbols;
2. choropleth plus categorical facilities;
3. heatmap plus labeled reference points;
4. two-source operational overview with primary, supporting, and reference
   layers.

Variants must cover missing values, skew, dense overlap, multilingual labels,
mobile viewports, conflicting layer visibility, high latitude, antimeridian
coordinates, shared sources, and unsupported cross-renderer requirements.

Corpus generation, manifests, data, split rotation, prompts, and hard
requirements are committed before model execution. Holdout task contents and
results are not used for implementation tuning.

## Conditions

Each representable task is run under:

1. direct multi-layer MapLibre authoring;
2. direct layered Vega-Lite authoring;
3. Atlaspec 0.2 followed by MapLibre compilation;
4. Atlaspec 0.2 followed by Vega-Lite compilation;
5. Atlaspec 0.2 with one validation-diagnostic repair opportunity.

Capability-negative tasks replace conditions 2 and 4 with an expected
fail-closed outcome. Unsupported output that is silently approximated counts as
a failure.

Localized edit tasks add a second turn to the direct MapLibre and Atlaspec
conditions. The first accepted artifact is preserved, and the edit request
names exactly one target layer.

## Deterministic acceptance

A first attempt passes only when:

- the Atlaspec or direct renderer artifact parses;
- every source, field, and layer reference resolves;
- all family and composition semantics validate;
- the renderer artifact passes its official parser or validator;
- Vega-Lite compilation emits zero warnings;
- authored layer order and purpose are preserved;
- legends agree with field semantics and renderer encodings;
- missing values and protected layers satisfy task requirements;
- no required layer or encoding is dropped;
- every task-specific hard check passes;
- no error-severity diagnostic remains.

Failures caused by transport, malformed output, warning-driven renderer drops,
or unsupported features remain in the denominator.

## Pre-committed automated gates

- at least 30% relative reduction in MapLibre first-attempt failure rate;
- no more than a 3-percentage-point Reliable Map Yield loss when the direct
  baseline failure rate is below 10%;
- at least 25% lower total uncached model tokens per accepted map;
- at least 25% lower output tokens per accepted map, reported separately;
- at least 30% fewer repair iterations;
- at least 95% cross-renderer semantic portability on representable tasks;
- 100% fail-closed accuracy on capability-negative tasks;
- at least 95% unrelated-layer edit survival;
- zero v0.1 compatibility regressions;
- primary yield improvement reproduced in at least two pre-declared model
  strata;
- 95% paired confidence interval excludes zero for the primary improvement.

The total-token gate is primary for cost. Output tokens are not used as a
substitute when input or cache accounting is available. Provider charge and
latency are secondary outcomes.

## Compatibility gates

- every checked-in 0.1 example has the same validation verdict;
- every valid 0.1 example compiles to byte-identical MapLibre JSON and decision
  records at the frozen compatibility commit;
- every 0.1 diagnostic regression fixture retains its stable diagnostic code;
- 0.1 to 0.2 upgrade is deterministic and non-mutating;
- upgrading an already-0.2 document is idempotent;
- single-layer guarded downgrade round-trips exactly where supported;
- public 0.1 schema and TypeScript exports remain available.

## Portability checks

For each cross-renderer task, normalize renderer output into a semantic record
containing:

- source and field identities;
- authored Atlaspec layer ID and purpose;
- geometry support;
- visual channel and field binding;
- scale semantics and domain;
- legend title, unit, range, or category domain;
- missing-value behavior;
- viewport and projection contract;
- label field and visibility requirements.

MapLibre and Vega-Lite pass portability only when both normalized records agree
with Atlaspec. Visual resemblance alone is insufficient.

## Edit survival checks

For a localized layer edit:

- stable Atlaspec layer IDs must remain unchanged;
- non-target Atlaspec layers must remain structurally identical;
- non-target normalized renderer contracts must remain identical;
- unrelated MapLibre layers should remain byte-identical;
- all prior non-target hard requirements must still pass;
- changed output size and changed renderer paths are recorded.

The evaluator reports target-layer changes separately from unrelated churn.

## Statistical analysis

- paired bootstrap intervals with 10,000 iterations;
- fixed seed committed before the first development model call;
- task-clustered bootstrap as the primary interval because repetitions from the
  same task are not independent;
- exact McNemar tests for paired pass/fail outcomes;
- paired non-parametric tests for tokens, charge, latency, and edit churn;
- raw contingency tables and effect sizes alongside p-values;
- task, composition archetype, difficulty, variant, backend, and model strata
  reported explicitly.

No LLM self-report is evidence. Learned or multimodal judges may be reported
only as secondary measures calibrated against deterministic checks and blinded
human labels.

## Required release evidence

Before calling Atlaspec 0.2 stable, publish:

- all development and one-time holdout raw reports;
- immutable corpus, prompt, reference, source, and lockfile digests;
- model and adapter identities;
- normalized cross-renderer semantic records;
- edit-survival records;
- compiler decisions and diagnostics;
- rendered screenshots for human and expert review;
- token, cache, charge, latency, repair, and failure accounting;
- compatibility fixture digests;
- an explicit list of passed, failed, and still-unmeasured gates.

Automated success alone remains narrower than the complete product verdict.
