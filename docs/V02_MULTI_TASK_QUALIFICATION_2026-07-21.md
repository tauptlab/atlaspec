# AtlasBench 0.2 multi-task local qualification

Date: 2026-07-21

## Verdict

The locked 0.2 development qualification completed all 6 jobs and all 216
expected condition runs. Both local agents received an overall **fail**, but
for different reasons:

- Codex failed the reliability, token-efficiency, portability, and capability
  fail-closed gates. Its direct MapLibre yield was 24/24, while first-attempt
  Atlaspec yield was 1/24.
- Claude passed the reliability and both token-efficiency gates. Atlaspec
  improved first-attempt yield from 12/24 to 20/24 and reduced uncached input
  tokens per accepted map by 73.84%. It still failed the locked portability
  and capability fail-closed gates.

This result does not support a model-independent Atlaspec advantage. It does
show a strong, statistically positive benefit for the tested Claude model and
a strong negative result for the tested Codex CLI path. The discrepancy is an
important R&D finding, not a result to average away.

The fresh 0.2 holdout remained sealed. No holdout model call was made, and the
development failures mean the holdout should not be opened under this version.

## Locked protocol

- Benchmark: `atlasbench-v02-local-qualification-v1`.
- Compiler commit: `379fc7e2eea08118cf50605955432e8fdccbb6cb`.
- Plan SHA-256:
  `5e8f6d76d9d508c0285d1d5a0be078a83fc82214fc68f69d97e0661f5afe7a56`.
- Tasks: 12 development-only tasks, covering four archetypes and three
  difficulty levels.
- Repetitions: 2.
- Conditions: direct MapLibre, Atlaspec MapLibre, Atlaspec with one repair,
  direct Vega-Lite, Atlaspec Vega-Lite, and capability-negative controls where
  applicable.
- Execution order: deterministic balanced scheduling.
- Expected/observed runs: 216/216.
- Missing, partial, invalid, or foreign runs: 0.
- Model responses: 343/343 attempts returned a response.
- Holdout exposed: `false`.

The Codex runner reported `codex-cli 0.144.4`; the CLI did not expose a resolved
model identity. Claude Code reported `2.1.17` with locked model
`claude-opus-4-5-20251101`.

## Locked gate results

All intervals below are 95% task-clustered bootstrap intervals with the locked
seed and 10,000 iterations. Token comparisons are within one agent only.

| Gate | Codex | Claude |
|---|---:|---:|
| Overall | **fail** | **fail** |
| Direct MapLibre first-attempt yield | 24/24 (100%) | 12/24 (50%) |
| Atlaspec first-attempt yield | 1/24 (4.17%) | 20/24 (83.33%) |
| Absolute yield delta | -95.83 pp `[-100, -87.5]` | +33.33 pp `[+4.17, +62.5]` |
| Relative failure reduction | not defined | 66.67% `[9.09%, 100%]` |
| Reliability gate | fail | **pass** |
| Uncached generation tokens / accepted map | 6,123 direct; 141,299 Atlaspec | 8,476 direct; 2,217 Atlaspec |
| Uncached-token reduction | -2,207.61% `[-2,453.27%, -588.50%]` | 73.84% `[46.61%, 89.63%]` |
| Uncached-token gate | fail | **pass** |
| Generation output tokens / accepted map | 1,716 direct; 15,721 Atlaspec | 1,706 direct; 557 Atlaspec |
| Output-token reduction | -816.01% `[-879.25%, -179.23%]` | 67.37% `[48.77%, 81.75%]` |
| Output-token gate | fail | **pass** |
| Direct edit survival | 20/24 (83.33%) | 12/12 (100%) |
| Atlaspec edit survival | 1/1 (100%) | 20/20 (100%) |
| Atlaspec edit gate | **pass**, denominator 1 | **pass** |
| Vega-Lite portability | 0/12 (0%) | 10/12 (83.33%) |
| Portability gate, threshold 95% | fail | fail |
| Capability fail-closed | 2/12 (16.67%) | 7/12 (58.33%) |
| Fail-closed gate, threshold 100% | fail | fail |

Codex's direct baseline was in the locked low-failure slice, so the reliability
rule used the precommitted 3 percentage-point non-inferiority margin rather than
relative failure reduction. Atlaspec missed that gate by a wide margin.

## Repair result

Repair is descriptive because the direct baseline has no symmetric repair
condition. It is not counted as proof of the locked failure-reduction gate.

| Agent | Repair runs | First accepted | Final accepted | Recovered | Repair iterations |
|---|---:|---:|---:|---:|---:|
| Codex | 24 | 2 | 18 | 16 | 22 |
| Claude | 24 | 18 | 24 | 6 | 6 |

The repair loop is useful: it recovered 22 rejected Atlaspec generations across
the two agents. It is also costly and does not erase the first-attempt Codex
failure. A future benchmark should add a symmetric direct-repair condition if
repair-adjusted reliability is intended as a primary claim.

## Cost and immutable local reports

Claude reported `$7.19204475` for its three completed jobs. Codex CLI did not
report a monetary charge, so no cross-agent cost comparison is made. The raw
reports remain under the git-ignored `work/v02-qualification/` bundle; their
hashes make replacement detectable.

| Report | SHA-256 | Reported charge |
|---|---|---:|
| `reports/codex/basic.json` | `5cefc5c781314a2e468eeca611cc8ceb1935f2233583bb831474006f68ffed64` | unavailable |
| `reports/codex/intermediate.json` | `e7a89688eb8dad27af91c32f3f6529e1bf86056c937cb1bffe826d896ba0a9aa` | unavailable |
| `reports/codex/adversarial.json` | `0e77f4bb2ad5180270b9305fe7e296e833b28eff82348d49d0a64cb192ab37ae` | unavailable |
| `reports/claude/basic.json` | `862c2e756be3836f15793950f09b61902db9a5999621531092dfacb5f4f05512` | `$2.38952350` |
| `reports/claude/intermediate.json` | `f18565ac6605197f31fe661caac14df1b13447db6d7848d206c70b3da22de1cb` | `$2.41736625` |
| `reports/claude/adversarial.json` | `9c9decadf9913bb5d347eef601047492eb7013aca816959ef4f11b4c0bed17a7` | `$2.38515500` |

## Claim boundary and next work

The admissible claim is narrow:

> In this locked 12-task, two-repetition development qualification, Atlaspec
> substantially improved first-attempt reliability and token efficiency for
> the tested Claude model, but did not reproduce on the tested Codex CLI path
> and did not meet renderer-portability or capability fail-closed gates.

The next engineering work should target the observed failure modes before any
holdout run:

1. make the generation reference more robust to Codex schema-value and union
   errors without weakening validation;
2. close the two remaining Claude portability failures;
3. make unsupported Vega-Lite capabilities fail closed rather than compile to
   misleading approximations;
4. rerun a newly versioned development qualification after changes, preserving
   this result as negative evidence;
5. open the fresh holdout only after both agents pass all locked development
   gates.
