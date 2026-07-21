# AtlasBench 0.2 post-hardening local qualification

Date: 2026-07-21

## Verdict

The versioned post-hardening qualification completed all 6 jobs and all 216
expected condition runs at frozen compiler commit
`587f6e475c95b07a264d7bca2a8281b6278bf35c`. The holdout remained sealed.

The result is agent-dependent and must not be averaged into one universal
claim:

- Claude passed every locked gate. Atlaspec raised accepted-map yield from
  66.67% to 100%, reduced total uncached generation tokens per accepted map by
  69.66%, and reduced generation output tokens by 61.84%.
- Codex passed reliability, output-token, edit-survival, portability, and
  fail-closed gates. It reduced output tokens by 70.97% and raised localized
  edit survival from 79.17% to 100%, but reduced total uncached generation
  tokens by only 3.21%. The locked threshold was 25%, so its overall verdict is
  **fail**.

This supersedes the first multi-task qualification as evidence for the hardened
reference. It does not erase that earlier negative result, establish
model-independent superiority, or authorize opening the fresh holdout.

## Locked execution

- Benchmark: `atlasbench-v02-local-qualification-v2`.
- Supersedes: `atlasbench-v02-local-qualification-v1`.
- Plan SHA-256:
  `d52f038cc265b9dcca57d142279c7d853da69b58598e4352cf214f89acc81c4a`.
- Reference SHA-256:
  `acecbcc4aca9c84dde559793b3ccb0b7ce6b49491efba8b15936f0f01f389ec5`.
- Tasks: 12 development tasks across four archetypes and three difficulties.
- Repetitions: 2, with deterministic balanced condition order.
- Expected/observed runs: 216/216; missing, partial, invalid, or foreign jobs: 0.
- Codex: `codex-cli 0.144.4`; resolved model identity was not reported by the
  CLI.
- Claude: Claude Code `2.1.17`, model `claude-opus-4-5-20251101`.
- Holdout exposed: `false`.

The status command returned `complete` with no source diagnostics before any
post-measurement code change. Later analyzer improvements intentionally make
the live bundle status report source drift; they do not mutate the frozen
reports or retroactively change the verdict.

## Locked gate results

All confidence intervals are 95% task-clustered bootstrap intervals using the
precommitted seed and 10,000 iterations. Token comparisons are within each
agent only.

| Gate | Codex | Claude |
|---|---:|---:|
| Overall | **fail** | **pass** |
| Direct MapLibre yield | 24/24 (100%) | 16/24 (66.67%) |
| Atlaspec MapLibre yield | 24/24 (100%) | 24/24 (100%) |
| Absolute yield delta | 0 pp `[0, 0]` | +33.33 pp `[+12.5, +54.17]` |
| Relative failure reduction | not defined | 100% `[100%, 100%]` |
| Reliability gate | **pass** | **pass** |
| Total uncached tokens / accepted map | 7,285.46 direct; 7,051.92 Atlaspec | 6,272.94 direct; 1,902.92 Atlaspec |
| Total uncached-token reduction | 3.21% `[-17.86%, +18.97%]` | 69.66% `[54.94%, 84.38%]` |
| Total uncached-token gate | fail | **pass** |
| Output tokens / accepted map | 1,713.29 direct; 497.42 Atlaspec | 1,195.19 direct; 456.13 Atlaspec |
| Output-token reduction | 70.97% `[68.92%, 72.72%]` | 61.84% `[50.13%, 74.25%]` |
| Output-token gate | **pass** | **pass** |
| Direct edit survival | 19/24 (79.17%) | 16/16 (100%) |
| Atlaspec edit survival | 24/24 (100%) | 23/24 (95.83%) |
| Atlaspec edit gate | **pass** | **pass** |
| Vega-Lite portability | 12/12 (100%) | 12/12 (100%) |
| Capability fail-closed | 12/12 (100%) | 12/12 (100%) |

All 48 Atlaspec repair-condition generations were accepted on the first
attempt, so no repair iteration was needed. This is descriptive only because
the protocol has no symmetric direct-MapLibre repair condition.

## Token-feasibility R&D

The post-measurement analyzer now separates uncached input from output and
calculates the input budget required by the locked total-token gate. This does
not alter the locked gate or its result.

| Diagnostic | Codex | Claude |
|---|---:|---:|
| Direct uncached input / accepted map | 5,572.17 | 5,077.75 |
| Atlaspec uncached input / accepted map | 6,554.50 | 1,446.79 |
| Atlaspec input reduction | -17.63% | 71.51% |
| Atlaspec total allowed by 25% gate | 5,464.09 | 4,704.70 |
| Atlaspec input allowed after observed output | 4,966.68 | 4,248.58 |
| Additional input reduction required | 1,587.82 | 0 |
| Output-only ceiling if inputs were equal | 23.52% | 19.05% |

For Codex, output compression alone cannot reach the 25% total-token threshold:
direct output is only 23.52% of its direct total. Atlaspec must also consume
less uncached input than the direct condition. The current 4,960-byte Atlaspec
reference is 3,333 bytes longer than the 1,627-byte MapLibre reference, but
reference compaction alone should not be assumed to close the measured
1,587.82-token input gap. Codex's ephemeral CLI context and Claude's cache
behavior also need to be isolated.

The next admissible R&D experiment should therefore lock three Atlaspec input
arms before model calls:

1. the current exhaustive Markdown reference;
2. a schema-derived compact reference with identical allowed keys, enums, and
   negative constraints;
3. the same compact reference delivered through a cache-stable adapter path.

Each arm must retain deterministic validation, first-attempt yield, localized
edit survival, portability, and capability fail-closed checks. A smaller prompt
that restores the old schema failures is not an optimization.

## Immutable local artifacts

The git-ignored reports remain under `work/v02-qualification-v2/`.

| Artifact | SHA-256 |
|---|---|
| `v02-local-plan.json` | `d52f038cc265b9dcca57d142279c7d853da69b58598e4352cf214f89acc81c4a` |
| `reports/codex/basic.json` | `280ca5b18240abb96eeee0c19049954d915cb496649fc7930669f05b419ae524` |
| `reports/codex/intermediate.json` | `bba3c92b4ebda7160bf6a2f698c52c42651bea93cc46681ab7b3190e5a96758c` |
| `reports/codex/adversarial.json` | `eb716703d8521ddb178030d6cf8c538af5c2adeb2f1cbf0bf13ed472e969071e` |
| `reports/claude/basic.json` | `980a33679362976d79311ebec0c855b778dfff38873ec9507c910caaa23cd8a7` |
| `reports/claude/intermediate.json` | `b2766c48747bf480f76068e8c880f1477a59d416f7a3e34439b53ddd8e1b824d` |
| `reports/claude/adversarial.json` | `dd95c7d8a541b0b78487d3d06444a7daa294a010b645342f5665ee24a2d4d753` |

Codex produced 180 model responses but did not expose monetary cost. Claude
produced 171 responses and reported `$7.249048` total. These call totals include
eligible localized-edit turns; the locked generation token gates exclude edit
turns.

