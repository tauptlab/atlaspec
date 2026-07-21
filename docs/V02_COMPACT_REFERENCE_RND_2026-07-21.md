# AtlasBench 0.2 compact-reference R&D

Date: 2026-07-21

## Decision

Do **not** promote the compact reference to the default Atlaspec 0.2 generation
path yet.

The 3,241-byte schema-derived reference is functionally viable: Codex and
Claude each produced 12/12 accepted Atlaspec MapLibre documents and preserved
12/12 localized edits. It therefore retained the hardened schema guidance on
this reused development slice despite being 34.66% smaller than the 4,960-byte
exhaustive reference.

It failed the precommitted token diagnostic, however:

- Codex uncached input fell 14.63%, just below the locked 15% target, while
  output tokens increased 29.08%, above the allowed 10% regression. Total
  generation tokens fell 11.55%.
- Claude's historical comparison was dominated by cache state. The compact run
  consumed 267.92% more uncached input than the prior exhaustive-reference
  result even though its output fell 4.81%. This is evidence that the two runs
  did not receive comparable cache treatment, not that a shorter document
  intrinsically costs more tokens.

The experiment establishes grammar viability, but it does not establish a
token-efficiency improvement suitable for changing the default.

## Locked design

- Experiment: `atlasbench-v02-compact-reference-rnd-v1`.
- Plan commit: `1c5870a84b16dfe398db71a79737b03fb4c721cb`.
- Plan SHA-256:
  `dbd75ec8a84e877419064881c14ba329478b5b0ef388b19a0ddf8dd767a89674`.
- Compact reference SHA-256:
  `3c19fe96a977659df434bd8f5168d7a997a69967c7c43efffc22b8048b74ea8f`.
- Historical exhaustive reference SHA-256:
  `acecbcc4aca9c84dde559793b3ccb0b7ce6b49491efba8b15936f0f01f389ec5`.
- Tasks: the same 12 inspected development tasks used by the post-hardening
  qualification.
- Condition: Atlaspec MapLibre only, one repetition per agent.
- Expected/observed runs: 24/24; model responses: 48/48 including edits.
- Holdout exposed: `false`.

The plan locked first-attempt yield and eligible edit survival at 90%, uncached
input reduction against the historical control at 15%, and output-token
regression at no more than 10%. Token savings could not compensate for a
reliability failure.

## Results

| Diagnostic | Codex | Claude |
|---|---:|---:|
| Compact first-attempt yield | 12/12 (100%) | 12/12 (100%) |
| Compact edit survival | 12/12 (100%) | 12/12 (100%) |
| Reliability diagnostic | **pass** | **pass** |
| Historical full uncached input / accepted map | 6,554.50 | 1,446.79 |
| Compact uncached input / accepted map | 5,595.25 | 5,323.08 |
| Input reduction | 14.63% | -267.92% |
| Input diagnostic | fail | fail |
| Historical full output / accepted map | 497.42 | 456.13 |
| Compact output / accepted map | 642.08 | 434.17 |
| Output regression | +29.08% | -4.81% |
| Output diagnostic | fail | **pass** |
| Historical full total / accepted map | 7,051.92 | 1,902.92 |
| Compact total / accepted map | 6,237.33 | 5,757.25 |
| Descriptive total reduction | 11.55% | -202.55% |
| Overall locked diagnostic | **fail** | **fail** |

Codex CLI did not expose monetary cost. Claude reported `$1.18414625` for the
24 compact-reference generation and edit responses.

## Why the Claude token comparison is confounded

The historical control came from a balanced six-condition, two-repetition
qualification. Repeated task data and prompt prefixes could receive provider
cache reads during that longer schedule. The compact diagnostic used one new
reference, one condition, and one repetition, so it did not reproduce the same
cache warm-up opportunities.

The adapter correctly classifies cache reads as cached and cache creation as
uncached. That accounting exposed the scheduling difference, but the historical
control design cannot separate these effects:

1. reference byte length;
2. provider tokenization;
3. prefix order, because task data precedes the reference;
4. cache creation and read timing;
5. stochastic output verbosity.

This is why cross-run raw token totals must not be interpreted as a language
property when delivery and cache state differ.

## Next experiment

The next R&D plan should use concurrent, counterbalanced full and compact arms
at one frozen commit. Each task/reference pair needs a distinct run identity so
the harness can alternate arm order without collisions. It should also record
input, cached input, output, and stable-prefix composition separately.

A second useful arm should place the static reference before task-specific
GeoJSON so a provider can cache the invariant prefix. That is a delivery-layer
optimization, not a grammar relaxation. Reliability, edit survival,
portability, and capability fail-closed checks must remain unchanged.

## Immutable local reports

| Report | SHA-256 | Runs / calls |
|---|---|---:|
| `compact-reference-v1-codex.json` | `16e613de8383268cea91613b52adcbd97cc24c41c1805fd9c6b9a5f7d74faa7c` | 12 / 24 |
| `compact-reference-v1-claude.json` | `c6cc6b2e98fba3be21ad3c046e6f547c1c43b40bc5afe8f46d3968fce7f05c36` | 12 / 24 |

Both reports remain under the git-ignored `work/v02-rnd/` directory and record
compiler commit `1c5870a84b16dfe398db71a79737b03fb4c721cb`.

