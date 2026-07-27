# Contributing to Atlaspec

Thank you for helping make agent-authored cartography more reliable.

Atlaspec is a research-stage language, compiler, and evaluation suite. Small,
well-scoped contributions are preferred over broad rewrites because schema and
compiler changes can affect renderer validity, portability, and benchmark
integrity at the same time.

## Good first contributions

- improve diagnostics without changing accepted document semantics;
- add a development-corpus case for a missing cartographic pattern;
- improve MapLibre or Vega-Lite renderer coverage;
- make examples and documentation easier to reproduce;
- add deterministic tests for a reported compiler failure; or
- improve the Evidence Lab without weakening its claim boundaries.

Look for issues labeled `good first issue`, `help wanted`, or `benchmark`.

## Development setup

Atlaspec requires Node.js 20 or newer.

```sh
git clone https://github.com/tauptlab/atlaspec.git
cd atlaspec
npm ci
npm run check
npm run build
```

Validate and compile an example:

```sh
npm run atlaspec -- validate examples/flood-risk.atlas.yaml
npm run atlaspec -- compile examples/flood-risk.atlas.yaml --output flood-risk.style.json
```

## Before opening a pull request

Run the complete local gate:

```sh
npm run check
npm run build
npm run benchmark:v02:dry-run
npm pack --dry-run
```

Keep generated references fresh when a schema or compiler change affects them:

```sh
npm run reference:atlaspec:generate
npm run reference:atlaspec:check
```

## Benchmark integrity

Atlaspec separates development evidence, sealed holdouts, and post-selected R&D.
That distinction is part of the project, not optional reporting style.

- Do not inspect or execute a sealed holdout to tune an implementation.
- Lock new thresholds and evaluation rules before measuring a new claim.
- Mark results obtained after observing failures as post-selected.
- Do not replace a locked headline score with a repaired replay.
- Include the command, source revision, environment, and raw artifact path for
  any new performance claim.

Changes to `benchmark/`, evaluation gates, or public benchmark wording should
explain which evidence class they affect.

## Pull request expectations

A useful pull request:

- has one clear purpose;
- includes tests for behavioral changes;
- updates user-facing documentation when contracts change;
- preserves stable diagnostic codes unless a breaking change is intentional;
- does not mix unrelated formatting or generated churn; and
- states any claim or compatibility boundary that remains unverified.

By contributing, you agree that your contribution is licensed under the
project's MIT License.

