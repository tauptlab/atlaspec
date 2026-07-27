# Atlaspec Roadmap

Atlaspec is a research-stage semantic map language and deterministic compiler.
This roadmap describes evidence and product milestones rather than promised
delivery dates.

## Now — publish the 0.2 research candidate

- publish `v0.2.0-rc.1` as a GitHub prerelease;
- keep the live Compiler Lab generated from and aligned with repository code;
- document contribution, security, citation, and benchmark-reproduction paths;
- collect independent renderer and agent reproductions;
- preserve the sealed v0.2 holdout until the release contract permits its
  one-time execution.

## Next — test generalization and usefulness

- reproduce generation results with precommitted hosted-model strata;
- freeze and run an adequately powered version of the paired
  [symmetric validator-and-repair baseline](SYMMETRIC_REPAIR_BASELINE.md),
  following the six-task development pilot;
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
- add bounded theme profiles and measure how often real requests require
  unsupported renderer customization;
- publish reusable agent skills and application adapters;
- establish versioned governance for the schema, compiler, and benchmark.

## Current evidence boundary

The strongest current confirmatory result is the one-time 12-task local
holdout: Atlaspec produced 120/120 accepted outputs and direct MapLibre produced
108/120, a difference of 10 percentage points with a 95% interval of +3.3 to
+18.3 points. A separate locked v0.2 development renderer diagnostic produced
68/72 healthy Atlaspec outputs and 40/72 direct outputs; it uses correlated
local-agent runs and project-authored gates and is reported as development
evidence rather than a fresh holdout.

These results support continued research and practical prototyping. They do not
yet establish production readiness, universal model generalization, human
map-reading benefit, or blind cartographer preference.

The next comparison must expand the six-task development
[symmetric-repair pilot](V02_SYMMETRIC_REPAIR_PILOT_2026-07-27.md) into an
adequately powered precommitted run, followed by schema/linter/compiler
ablations.

See [BENCHMARK_0.2.md](BENCHMARK_0.2.md) and
[V02_RELEASE_CANDIDATE_VERIFICATION_2026-07-23.md](V02_RELEASE_CANDIDATE_VERIFICATION_2026-07-23.md)
for the locked contract and verification record.
