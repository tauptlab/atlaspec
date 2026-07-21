# AtlasBench 0.2 reference-layout A/B R&D

Date: 2026-07-21

## Decision

Keep the exhaustive Atlaspec 0.2 reference as the default. Do not promote the
compact reference from this experiment.

For Codex, placing the exhaustive static reference before task-specific content
was more useful than shortening it:

- all four arms achieved 4/4 first-attempt acceptance and 4/4 localized edits;
- reference-first reduced uncached input by 7.09% with the full reference and
  by 1.70% with the compact reference;
- compacting the reference reduced uncached input by only 6.67% in the existing
  layout and 1.25% in reference-first layout, missing the locked 10% target;
- the best observed Codex arm was compact-reference-first at 6,523.50 total
  uncached generation tokens per accepted map, 7.47% below full-data-first.

The small Codex result supports further work on cache-stable delivery, but not
a default change. Claude cannot confirm or refute it because authentication
expired during the locked run. Its transport failures remain in the result and
all affected token comparisons are **insufficient**.

## Locked protocol

- Experiment: `atlasbench-v02-reference-layout-ab-v1`.
- Execution commit: `b23ae7125605fbf151277cae70835e1b062cdd86`.
- Plan SHA-256:
  `b225ecf4e04be5c477edbdc376d81f51f8a309d8c01a2b4463cc72f01d56a9a5`.
- Tasks: four reused development tasks, one per selected map archetype.
- Repetitions: 1.
- Arms: full-data-first, full-reference-first, compact-data-first, and
  compact-reference-first.
- Counterbalancing: every arm occupied each ordinal call position exactly once
  per agent.
- Expected/observed condition runs: 32/32.
- Maximum/observed attempts: 64/59; missing attempts are ineligible edits after
  failed initial generations.
- Holdout exposed: `false`.

The 90% per-arm yield and edit thresholds require 4/4 with a four-run
denominator. Compact input reduction was locked at 10%, reference-first input
non-inferiority at a 5% margin, and output regression at no more than 10%.
Token comparisons are within agent and matched by task/reference-layout arm.

## Codex result

| Arm | First / edit | Cached input / response | Uncached input / accepted | Output / accepted | Total / accepted |
|---|---:|---:|---:|---:|---:|
| Full, data-first | 4/4 · 4/4 | 8,960 | 6,479.50 | 571.00 | 7,050.50 |
| Full, reference-first | 4/4 · 4/4 | 9,472 | 6,020.00 | 538.00 | 6,558.00 |
| Compact, data-first | 4/4 · 4/4 | 8,960 | 6,047.50 | 573.25 | 6,620.75 |
| Compact, reference-first | 4/4 · 4/4 | 8,960 | 5,944.50 | 579.00 | 6,523.50 |

| Paired diagnostic | Input change | Output regression | Locked result |
|---|---:|---:|---|
| Compact vs full, data-first | 6.67% reduction | +0.39% | input fail, output pass |
| Compact vs full, reference-first | 1.25% reduction | +7.62% | input fail, output pass |
| Reference-first vs data-first, full | 7.09% reduction | -5.78% | **pass** |
| Reference-first vs data-first, compact | 1.70% reduction | +1.00% | **pass** |

The additional 512 cached input tokens observed for full-reference-first are
consistent with the static prefix crossing a provider cache block boundary.
That is an inference from reported usage, not proof of the provider's internal
cache policy. The compact reference did not show the same added cache read.

Codex's overall locked diagnostic is **fail** because both compact-input gates
missed 10%, even though every reliability, edit, layout, and output gate passed.
The CLI reported no monetary cost.

## Claude result and authentication failure

| Arm | First yield | Edit survival | Transport failures | Token result |
|---|---:|---:|---:|---|
| Full, data-first | 3/4 | 2/3 | 1 generation + 1 edit | insufficient |
| Full, reference-first | 2/4 | 2/2 | 2 generation | insufficient |
| Compact, data-first | 3/4 | 3/3 | 1 generation | insufficient |
| Compact, reference-first | 3/4 | 3/3 | 1 generation | insufficient |

The report contains 21 successful responses and 6 transport failures. The
pre-fix adapter retained only the nonzero exit code because Claude emitted its
structured error on stdout. An immediate read-only diagnostic invocation
reproduced the failure as HTTP 401 `Invalid authentication credentials` with
the instruction to run `/login`. This establishes an external authentication
failure rather than an Atlaspec validation failure.

Claude's overall diagnostic is **fail** because transport failures remain in
the locked reliability denominator. Every token comparison is
**insufficient**; averages over only surviving responses are intentionally not
reported. Successful responses reported `$1.00738375` total.

Commit `1f533a6` now preserves bounded stdout as well as stderr for future
nonzero local-CLI exits. It was made after the frozen reports and does not
rewrite them.

## What this changes

The next optimization target should be reference delivery order, not further
grammar deletion. A 12-task, two-repetition confirmation of full-reference-first
would be warranted after Claude is reauthenticated. It must be a newly
versioned plan rather than a retry or overwrite of this result.

The compact reference remains useful as an experimental artifact because it
retained Codex grammar reliability, but neither compact experiment met its
locked token objective. The exhaustive reference remains the safer default.

## Immutable reports

| Report | SHA-256 | Runs / responses / transport failures |
|---|---|---:|
| `reference-layout-ab-v1-codex.json` | `6e44c00917756cf2fad236cc6e9c858566417e9721fb0767b096f7b25f7640f7` | 16 / 32 / 0 |
| `reference-layout-ab-v1-claude.json` | `d9c5a367219a1371948b8eee75664676d8b1b9b0bb3310155c945bd28220d0ad` | 16 / 21 / 6 |

Both reports remain under the git-ignored `work/v02-rnd/` directory.
