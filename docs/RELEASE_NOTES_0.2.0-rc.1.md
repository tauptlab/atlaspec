# Atlaspec 0.2.0-rc.1 — research preview

Atlaspec 0.2 is an intent-first map specification language and deterministic
compiler for agent-authored cartography. This candidate adds multi-layer
documents, renderer portability, migration, decision traces, and browser-backed
visual evaluation while preserving explicit 0.1 compatibility.

## Start here

- [Live Compiler Lab](https://tauptlab.github.io/atlaspec/)
- [60-second overview](https://github.com/tauptlab/atlaspec/blob/v0.2.0-rc.1/media/atlaspec-60s-demo.mp4)
- [Quick start](https://github.com/tauptlab/atlaspec#quick-start)
- [Roadmap](ROADMAP.md)
- [Benchmark contract](BENCHMARK_0.2.md)

## Highlights

- ordered, stable-ID multi-layer documents with explicit layer purpose;
- deterministic MapLibre compilation and decision tracing;
- a fail-closed portable Vega-Lite v6 subset with capability inspection;
- guarded 0.1-to-0.2 upgrade and representable downgrade;
- localized edit-survival and cross-renderer semantic evaluation;
- real MapLibre and Vega execution with geometry, label, clipping, duplicate,
  placement, and point-symbol-occlusion gates;
- English-only public Compiler Lab generated from semantic-lint and compiler
  outputs.

## Evidence, with boundaries

The one-time 12-task local holdout produced 120/120 accepted Atlaspec outputs
and 108/120 direct MapLibre outputs: a 10 percentage-point difference with a
95% interval from +3.3 to +18.3 points.

The separate locked v0.2 **development** renderer evaluation produced:

| Condition | Healthy outputs | Rate |
|---|---:|---:|
| Atlaspec | 68/72 | 94.44% |
| Direct renderer generation | 40/72 | 55.56% |

The observed difference is **+38.89 percentage points**. After those failures
were inspected, a compiler remediation replay reached 72/72 for Atlaspec. That
result is useful repair verification but remains post-selected evidence, not a
fresh benchmark estimate.

The sealed v0.2 holdout has not been executed. Hosted-model reproduction, human
map-reading tasks, blind cartographer review, and production-readiness evidence
remain open. Do not present this candidate as stable `0.2.0` or as an npm
publication.

Official renderer validation followed by a symmetric direct-authoring repair
opportunity has not yet been measured. The development renderer gates were
authored by the project and are not an external cartographic gold standard.

## Verification

The release source passed:

```text
42 test files / 160 tests
Compiler Lab generation and interface tests
48-task v0.1 corpus integrity
48-task v0.2 corpus integrity
3 generated-reference integrity checks
TypeScript build
214/214 deterministic v0.2 dry-run conditions
npm package dry run: 52 files, 48.6 kB packed
```

See the dated
[release-candidate verification record](V02_RELEASE_CANDIDATE_VERIFICATION_2026-07-23.md)
for the complete earlier audit and the [changelog](../CHANGELOG.md) for
compatibility details.

## Assets

The GitHub prerelease includes the source archive plus:

- `atlaspec-0.2.0-rc.1.tgz` — local-installable npm package;
- `atlaspec-60s-demo.mp4` — 1280×720 H.264, 24 fps, exactly 60 seconds;
- `atlaspec-60s-poster.png` — link and video poster;
- `atlaspec-60s-demo.srt` — English captions.

This is a GitHub research prerelease. The package is not published to npm.
