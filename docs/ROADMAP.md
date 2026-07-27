# Atlaspec Roadmap

Atlaspec is a research-stage semantic map language and deterministic compiler.
This roadmap describes evidence and product milestones rather than promised
delivery dates.

## Now — publish the 0.2 research candidate

- publish `v0.2.0-rc.1` as a GitHub prerelease;
- keep the live Evidence Lab reproducible and aligned with repository evidence;
- document contribution, security, citation, and benchmark-reproduction paths;
- collect independent renderer and agent reproductions;
- preserve the sealed v0.2 holdout until the release contract permits its
  one-time execution.

## Next — test generalization and usefulness

- reproduce generation results with precommitted hosted-model strata;
- run blind map-reading tasks with people, including completion time and error
  rate;
- obtain structured cartographer review of usefulness and failure severity;
- add deterministic local-background contrast and semantic-priority gates;
- expand edit-survival and compiler-feature ablations;
- measure end-to-end task cost separately from provider-specific token counts.

## Later — production-shaped adoption

- stabilize the `0.2` compatibility policy and publish a stable package;
- add editor and language-server support;
- expand portable renderer targets and explicit capability negotiation;
- integrate geospatial analysis primitives without turning the language into a
  general GIS runtime;
- publish reusable agent skills and application adapters;
- establish versioned governance for the schema, compiler, and benchmark.

## Current evidence boundary

The strongest current v0.2 result is a locked development renderer evaluation:
Atlaspec produced 68/72 healthy outputs and direct renderer generation produced
40/72, a difference of 38.89 percentage points. A later, post-selected repair
replay reached 72/72 for Atlaspec and is reported separately.

These results support continued research and practical prototyping. They do not
yet establish production readiness, universal model generalization, human
map-reading benefit, or blind cartographer preference.

See [BENCHMARK_0.2.md](BENCHMARK_0.2.md) and
[V02_RELEASE_CANDIDATE_VERIFICATION_2026-07-23.md](V02_RELEASE_CANDIDATE_VERIFICATION_2026-07-23.md)
for the locked contract and verification record.
