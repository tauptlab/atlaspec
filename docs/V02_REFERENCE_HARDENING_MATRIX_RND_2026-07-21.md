# AtlasBench 0.2 reference-hardening matrix R&D

Date: 2026-07-21

## Verdict

The precommitted Atlaspec-only R&D matrix completed all 48 expected condition
runs and all 72 model calls. Both local agents passed every locked diagnostic
threshold:

- Atlaspec MapLibre first-attempt yield: 24/24 across both agents;
- localized edit survival: 24/24 eligible edits;
- representable Vega-Lite portability: 12/12;
- Vega-Lite capability fail-closed: 12/12;
- schema, semantic-contract, transport, missing, or foreign-run failures: 0.

The result strongly supports the generation-reference root-cause diagnosis.
The same 12 development tasks had previously produced severe Codex schema
failures and incomplete Claude portability/capability results. After the
reference was made exhaustive, the improvement generalized from the first five
targeted regressions to every selected archetype and difficulty cell.

This is still post-qualification R&D. It uses previously inspected development
tasks, one repetition, no direct baseline, and no repair condition. It cannot
replace the failed official qualification or establish Atlaspec superiority.
The fresh v0.2 holdout remained sealed.

## Locked execution

- Experiment: `atlasbench-v02-reference-hardening-rnd-v1`.
- Plan commit: `25dbbe2bc248eb349afb32d9cb299189dae08a4f`.
- Plan SHA-256:
  `39cfeffb23647682287b599f1a5042035692240ed011dc40c4747191a959602b`.
- Reference SHA-256:
  `acecbcc4aca9c84dde559793b3ccb0b7ce6b49491efba8b15936f0f01f389ec5`.
- Tasks: the 12 development-only tasks used by the prior qualification.
- Repetitions: 1.
- Runs per agent: 24.
- Conditions: Atlaspec MapLibre, representable Atlaspec Vega-Lite, and
  capability-negative Vega-Lite as applicable.
- Direct baseline: excluded.
- Repair: excluded.
- Holdout exposed: `false`.

The plan locked a 90% MapLibre first-attempt threshold, 95% portability, 100%
capability fail-closed, and 95% edit survival before either expanded report was
generated. With the available integer denominators, both Vega and edit gates
required perfect observed results.

## Results

| Agent | MapLibre first | MapLibre final | Edit survival | Vega portability | Capability fail-closed | Diagnostic status |
|---|---:|---:|---:|---:|---:|---|
| Codex | 12/12 | 12/12 | 12/12 | 6/6 | 6/6 | **pass** |
| Claude | 12/12 | 12/12 | 12/12 | 6/6 | 6/6 | **pass** |
| Combined | 24/24 | 24/24 | 24/24 | 12/12 | 12/12 | **pass** |

Every successful MapLibre generation was edited through the existing localized
edit protocol. All unrelated layer structure and normalized semantics remained
stable.

## Descriptive token and cost accounting

Tokens are not compared across agents. There is no direct condition, so no
token-reduction claim is possible.

### Codex

| Condition | Runs | Uncached generation input / run | Generation output / run |
|---|---:|---:|---:|
| Atlaspec MapLibre | 12 | 5,960.42 | 499.08 |
| Atlaspec Vega-Lite | 6 | 5,965.17 | 463.50 |
| Capability negative | 6 | 6,295.67 | 554.67 |

Codex CLI reported no monetary charge.

### Claude

| Condition | Runs | Uncached generation input / run | Generation output / run |
|---|---:|---:|---:|
| Atlaspec MapLibre | 12 | 2,547.50 | 455.92 |
| Atlaspec Vega-Lite | 6 | 3,223.50 | 429.17 |
| Capability negative | 6 | 3,364.00 | 485.17 |

Claude reported `$0.93293925` for generation and `$0.60857775` for edits, or
`$1.54151700` total.

## Immutable local reports

The reports remain under the git-ignored `work/v02-rnd/` directory. Both contain
24 unique run IDs, the locked model identity, and compiler commit
`25dbbe2bc248eb349afb32d9cb299189dae08a4f`.

| Report | SHA-256 | Runs / calls |
|---|---|---:|
| `reference-hardening-matrix-v1-codex.json` | `2fa19490b87458b08a1d3170a5bce837787ac56fe1719c28c694076125ed7951` | 24 / 36 |
| `reference-hardening-matrix-v1-claude.json` | `327d9e6f3c640a84b550cc750fdede4e1264edecee087f305ae5ac2d6d874e01` | 24 / 36 |

## What the result establishes

The admissible engineering conclusion is:

> The exhaustive v0.2 generation reference eliminated the observed schema,
> invented-zoom, portability, and capability-control failures across the full
> reused 12-task development slice for both tested local agents.

The result does not establish:

- performance on unseen tasks or the sealed holdout;
- an Atlaspec advantage over direct MapLibre or direct Vega-Lite;
- two-repetition stability or a confidence interval;
- repair-adjusted reliability;
- model-independent token savings.

## Next admissible measurement

The next step should be a newly versioned development qualification that is
committed before calls and restores direct baselines, balanced condition order,
two or more repetitions, repair accounting, and task-clustered intervals. The
prior failed qualification and this post-selected R&D result must both remain
visible. The holdout should be opened only if both agents pass every new
development gate.
