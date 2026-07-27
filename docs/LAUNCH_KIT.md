# Atlaspec Launch Kit

This kit is deliberately conservative. Atlaspec is an early research candidate
with promising local evidence, not a proven universal solution for
AI-generated maps.

## One-line positioning

**Atlaspec is an opinionated semantic map IR and deterministic compiler that
lets AI agents author enforceable cartographic intent instead of renderer
plumbing.**

## Thirty-second explanation

AI agents can generate MapLibre or Vega-Lite configuration, but renderer
validity does not guarantee sound cartography. Atlaspec gives the agent a
smaller typed language for audience, fields, visual intent, zoom behavior, and
constraints. Its semantic linter can reject choices such as unnormalized raw
counts on unequal-area polygons, and its compiler records deterministic
renderer decisions such as area-proportional symbol scaling.

In a one-time 12-task local holdout, Atlaspec produced 120/120 accepted outputs
versus 108/120 for direct MapLibre: a 10 percentage-point difference with a 95%
interval from +3.3 to +18.3 points. A stronger direct baseline with official
validation and symmetric repair, external tasks, human evaluation, and fresh
v0.2 confirmation remain open.

## Claim table

| Topic | Safe wording | Required boundary |
|---|---|---|
| Local accepted yield | 120/120 Atlaspec vs 108/120 direct MapLibre in a one-time 12-task local holdout (+10 pp) | Two local agents, five repetitions, consumed holdout |
| Output tokens | 77.3% lower for the tested Codex CLI and 59.4% lower for the tested Claude Code version | Provider accounting is not cross-comparable |
| v0.2 renderer health | 68/72 Atlaspec vs 40/72 direct in a locked development diagnostic | Correlated runs and project-authored gates; not the sealed holdout |
| Repaired replay | Post-selected compiler repair reached 72/72 | Remediation evidence, not a fresh estimate |
| Production readiness | Research candidate for evaluation and prototyping | No production-readiness claim |

Never shorten `94.44% healthy renderer outputs in a locked development
diagnostic` to `94.44% accurate`. Do not headline the post-selected 72/72
replay.

## Product boundary

Atlaspec 0.2 validates and compiles semantic cartographic documents. It does
not perform routing, visibility, shadow simulation, spatial analysis,
geoprocessing, 3D rendering, or arbitrary renderer-native design.

The earlier browser solvers are isolated in
`experiments/spatial-analysis` and must be described only as a separate future
research exploration.

## Launch sequence

1. Verify the Compiler Lab and every README link from a signed-out browser.
2. Publish a technical Show HN post that links directly to the runnable lab.
3. Publish a Korean technical summary to GeekNews.
4. Share the scope-aligned 60-second video in geospatial and agent communities.
5. Ask for one concrete action: provide a cartographic counterexample or
   reproduce a benchmark condition.
6. Publish a follow-up only after a stronger baseline or independent result.

## Hacker News author notes

Rewrite these points in the maintainer's own voice before posting:

- Renderer-valid output can still be cartographically misleading.
- Atlaspec represents explicit field semantics and enforces cartographic policy.
- The live lab shows actual compiler-generated diagnostics and artifacts.
- The local holdout improved accepted yield by 10 points, but it contains only
  12 unique tasks and two local agents.
- The direct validator-plus-repair baseline and independent review are not yet
  complete.
- Feedback is requested on counterexamples, the abstraction boundary, and the
  fairest stronger baseline.

Suggested title:

> Show HN: Atlaspec – an enforceable semantic IR for agent-authored maps

## GeekNews draft

### 제목

Atlaspec – AI 에이전트가 지도 렌더러 코드 대신 검증 가능한 지도 의도를 작성하는 의미론적 IR

### 본문

MapLibre나 Vega-Lite 설정이 문법적으로 유효하더라도 잘못된 단계구분도,
면적이 아닌 반지름에 비례한 심볼, 누락값 은폐 같은 카토그래피 오류가
남을 수 있습니다. Atlaspec은 필드 의미와 지도 목적을 명시하고,
semantic lint와 결정론적 컴파일러가 이러한 정책을 검사하도록 만든
연구용 IR입니다.

12개 태스크를 5회 반복하고 두 로컬 에이전트로 실행한 일회성
홀드아웃에서는 Atlaspec 120/120, 직접 MapLibre 108/120의 accepted
output을 얻었습니다(+10%p, 95% CI +3.3~+18.3%p).

다만 공식 renderer validator와 동일한 1회 repair를 제공하는 더 강한
직접 생성 기준선, 외부 태스크, 사람 대상 평가, 새 v0.2 확인 실험은
아직 남아 있습니다. Compiler Lab은 이 한계와 실제 semantic lint 및
compiler 결정을 함께 공개합니다.

- Demo: https://tauptlab.github.io/atlaspec/
- GitHub: https://github.com/tauptlab/atlaspec

## Short social post

Renderer-valid does not mean cartographically sound.

Atlaspec is an opinionated semantic map IR that rejects unsafe choices and
deterministically compiles MapLibre and a portable Vega-Lite subset.

One-time local holdout: 120/120 accepted vs 108/120 direct MapLibre (+10 pp;
12 tasks, two local agents). Stronger baselines and independent review remain
open.

Compiler Lab: https://tauptlab.github.io/atlaspec/

## Response guide

**“Is this just another YAML wrapper?”**
The testable contribution is enforceable cartographic semantics and
deterministic policy, not YAML brevity.

**“Would validator feedback and retry solve the direct baseline failures?”**
It may solve many syntax failures. That symmetric comparison is now a required
next experiment and should be reported even if it erases the current delta.

**“Why not use Vega-Lite?”**
Vega-Lite is already a valuable abstraction and remains a direct baseline.
Atlaspec investigates explicit cross-renderer cartographic semantics,
fail-closed capability boundaries, and decision traces.

**“Is the compiler too opinionated?”**
Yes, intentionally. Atlaspec targets a constrained safety-oriented subset.
Future theme profiles and explicit fallback reporting should expand design
coverage without hiding when the compiler cannot represent a request.

**“Does the benchmark prove general superiority?”**
No. It motivates further research under the reported local conditions.
