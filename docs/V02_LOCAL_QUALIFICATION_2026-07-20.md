# AtlasBench 0.2 local qualification

Date: 2026-07-20

## Verdict

The v0.2 runner made real local model calls and found useful failures, but this
qualification does **not** show an Atlaspec reliability advantage. In the final
balanced slice, direct MapLibre passed first-attempt generation for both local
agents (2/2), while Atlaspec passed for neither (0/2). The sample is one
development task with one repetition, so it is diagnostic evidence rather than
an estimate of general performance.

No v0.2 holdout task was called. No official gate was evaluated or passed.

## Locked environment

- Codex CLI: `codex-cli 0.144.4`; model identity remains unreported by the CLI.
- Claude Code: `2.1.17`; resolved model `claude-opus-4-5-20251101`.
- balanced-run compiler commit: `ef20bda`.
- conditions: `direct-maplibre` and `atlaspec-maplibre`.
- repetition count: 1.
- task: `choropleth-proportional-symbols-basic-dense-multilingual-mobile`.
- execution order: Atlaspec first, direct MapLibre second, derived from the
  task's locked manifest position.

## Balanced result

| Agent | Condition | First generation | Edit | Generation uncached input | Generation output | Failure |
|---|---|---:|---:|---:|---:|---|
| Codex | Atlaspec → MapLibre | fail | not attempted | 6,049 | 483 | invented schema values and invalid metadata shape |
| Codex | direct MapLibre | pass | fail | 5,102 | 1,331 | unrelated renderer layers changed during the edit |
| Claude | Atlaspec → MapLibre | fail | not attempted | 0 | 0 | local CLI transport exited 1 before reporting usage |
| Claude | direct MapLibre | pass | pass | 8,437 | 704 | none |

Transport failures remain in the denominator. Token cost is not compared per
accepted map because the balanced Atlaspec condition produced zero accepted
maps. Codex monetary charge is unavailable from its CLI. The successful Claude
direct generation reported USD 0.0703275 before its edit call.

## Development defects found before the balanced run

The first live slice exposed an evaluator false negative: both formats could
use the exact locked GeoJSON while choosing a harmless renderer-local source
alias. Treating that alias as semantic identity could exaggerate Atlaspec's
advantage. Commit `4880a1b` changed MapLibre normalization to identify sources
by exact data path and still reject missing or ambiguous files.

The first post-fix slice then exposed an execution-order bias. Direct MapLibre
always ran before Atlaspec, so the Atlaspec request could receive more provider
prompt-cache credit. Commit `ef20bda` rotates condition order by locked task
position and repetition. Pre-balance token differences are therefore not used
as format evidence.

Before balancing, one Claude run accepted both formats. Atlaspec used 439
generation output tokens versus 693 for direct MapLibre, but its uncached input
was heavily affected by running second. This observation is retained but is
not counted as proof of the 25% token gate.

## Raw local reports

The runner wrote immutable reports under `work/v02/`. This directory is
intentionally git-ignored; hashes make accidental replacement detectable.

| Report | SHA-256 | Role |
|---|---|---|
| `codex-qualification.json` | `f3b2ac9a9f512f920cd1d0b48a627966192e1ba4478d084ec8331206260bd02e` | evaluator discovery |
| `claude-qualification.json` | `74dcae7101bc40d1fd3cc34c9e03abece3229f8cb336509e4210502a896a0bb4` | evaluator discovery |
| `codex-postfix.json` | `9d15d5833bdc9c86084e8bace9ba7fadd249c7799b3d5655e30047415c6a57e7` | source fix, pre-balance |
| `claude-postfix.json` | `bcf3b884d745076e01426ea671ca407312367098082ee8e58ef5f58fee2bc9f2` | source fix, pre-balance |
| `codex-balanced.json` | `5b11c753340802c05e9b78832841465775329c3ca9620e011aeaf1f9e01674d2` | current balanced evidence |
| `claude-balanced.json` | `7fdf92f2ca53452e680e2420bb847f39b4ac64fc4de2361cc904d17b4599b994` | current balanced evidence |

There were 18 actual local model calls across discovery, post-fix, and balanced
runs. Earlier reports are preserved as R&D provenance and are not pooled into
the final balanced rates.

## Gate status

- H1 multi-layer reliability: **not demonstrated**; balanced diagnostic result
  points in the opposite direction.
- H2 renderer portability: **unmeasured by live models**.
- H3 localized edit survival: direct MapLibre 1/2 in the balanced diagnostic;
  Atlaspec has no eligible denominator because both first generations failed.
- 30% failure reduction: **not evaluated**.
- 25% uncached-token and output-token reductions: **not evaluated**.
- two-model reproduction: **not evaluated**.
- confidence interval and McNemar gates: **insufficient sample**.
- holdout: **untouched**.

## Next admissible evidence

The next run should use a precommitted multi-task development qualification,
at least two repetitions, the balanced scheduler, and all applicable v0.2
conditions. It must analyze generation and edit tokens separately, retain
transport failures, and avoid tuning on any holdout output. Only after the
development workflow and analysis are frozen should the five-repetition
holdout be exposed once.
