# Atlaspec Launch Kit

This kit keeps launch messages concise, reproducible, and inside the evidence
boundary. Update the release URL after publishing a new candidate.

## One-line positioning

**Atlaspec is a semantic map language and deterministic compiler that lets AI
agents specify cartographic intent instead of inventing renderer plumbing.**

## Thirty-second explanation

AI agents can generate MapLibre or Vega-Lite JSON, but those renderer-native
surfaces are large and brittle. Atlaspec gives the agent a smaller, typed
language for audience, fields, visual intent, zoom behavior, and constraints.
Its compiler validates those choices and emits deterministic renderer
artifacts. In a locked v0.2 development renderer evaluation, 68/72 Atlaspec
outputs were healthy versus 40/72 direct outputs. The live Evidence Lab exposes
the result and deterministic spatial examples without pretending that a
browser timing panel is an LLM benchmark.

## Verified claims

| Message | Safe public wording | Boundary to retain |
|---|---|---|
| v0.2 renderer health | 68/72 Atlaspec outputs vs 40/72 direct outputs in a locked development evaluation (+38.89 pp) | Development result, not the sealed v0.2 holdout |
| Repaired replay | The compiler repair replay reached 72/72 | Post-selected remediation, not a fresh estimate |
| v0.1 local agents | Both tested local agents improved accepted yield from 90% to 100% | Local Codex and Claude versions, consumed holdout |
| Output size | Atlaspec used 77.3% fewer output tokens for Codex and 59.4% fewer for Claude | Provider token accounting is not cross-comparable |
| Production readiness | Research candidate suitable for evaluation and prototyping | No production-readiness claim |

## Launch sequence

1. Publish the GitHub prerelease with the tarball, 60-second video, poster, and
   captions.
2. Verify the live Evidence Lab and every README link from a signed-out browser.
3. Post the technical launch to Hacker News and GeekNews.
4. Post a shorter visual version to LinkedIn, X, Bluesky, and relevant
   geospatial communities.
5. Ask for one concrete action: reproduce a benchmark task, try a map request,
   or report a renderer failure.
6. Publish a follow-up only when new independent evidence or a meaningful
   compiler capability exists.

## Hacker News draft

### Title

Show HN: Atlaspec – a semantic map language for reliable AI-generated cartography

### Body

I built Atlaspec after repeatedly seeing AI agents produce plausible but invalid
or misleading renderer-native map configurations.

Instead of asking a model to author MapLibre or Vega-Lite plumbing directly,
Atlaspec asks for cartographic intent in a smaller typed YAML language, then
validates and deterministically compiles it.

The current v0.2 research candidate includes multi-layer maps, MapLibre and a
portable Vega-Lite subset, migration, decision traces, and browser-backed
visual gates. In the locked development renderer evaluation, Atlaspec produced
68/72 healthy outputs versus 40/72 for direct renderer generation (+38.89
percentage points). A repair made after inspecting those failures reached
72/72, and I keep that post-selected result separate.

Live Evidence Lab: https://tauptlab.github.io/atlaspec/

Source and reproducible evidence: https://github.com/tauptlab/atlaspec

I would especially value feedback on the language boundary, missing
cartographic failure modes, and independent reproductions.

## GeekNews draft

### Title

Atlaspec – AI 에이전트를 위한 의도 중심 지도 언어와 결정론적 컴파일러

### Body

AI가 MapLibre/Vega-Lite 설정을 직접 만들 때 발생하는 큰 생성 표면과
렌더러 오류를 줄이기 위해 Atlaspec을 만들었습니다. 에이전트는 YAML로
지도 의도와 제약을 기술하고, 스키마 검증과 결정론적 컴파일러가
렌더러별 구현을 담당합니다.

잠금된 v0.2 개발 렌더러 평가에서는 Atlaspec 68/72, 직접 생성 40/72의
정상 출력이 확인됐습니다(+38.89%p). 실패를 본 뒤 적용한 수정 재실행
72/72는 사후 선택된 결과로 별도 표기했습니다.

라이브 Evidence Lab에서 결과와 그림자, CCTV 가시성, 제약 경로 예제를
직접 확인할 수 있습니다.

- Demo: https://tauptlab.github.io/atlaspec/
- GitHub: https://github.com/tauptlab/atlaspec

언어의 추상화 경계, 빠진 지도 실패 유형, 독립 재현에 대한 의견을
받고 싶습니다.

## Short social post

AI agents should describe what a map must communicate—not hand-author every
renderer expression.

Atlaspec turns semantic YAML into deterministic MapLibre and portable Vega-Lite
artifacts. Locked v0.2 development evaluation: 68/72 healthy outputs vs 40/72
direct (+38.89 pp).

Try the Evidence Lab: https://tauptlab.github.io/atlaspec/

Research candidate, source and evidence open:
https://github.com/tauptlab/atlaspec

## Suggested screenshots

- Evidence Lab hero with the `94.44% vs 55.56%` comparison visible;
- a side-by-side semantic YAML and compiled renderer artifact;
- one deterministic analysis panel each for shadow, CCTV, and routing;
- the benchmark methodology panel showing the locked/post-selected boundary.

Use the generated poster in `media/atlaspec-60s-poster.png` for link previews
when a platform does not produce a useful GitHub card.

## Response guide

**“Is this just another JSON/YAML wrapper?”**  
The research question is whether a smaller semantic authoring surface plus
deterministic compilation improves valid cartographic outcomes. Atlaspec ships
the compiler, validation rules, renderer adapters, and evaluation evidence
together so that claim can be tested.

**“Why not tool-call MapLibre directly?”**  
Tool calling changes transport, not the size or fragility of the authored
renderer contract. Atlaspec moves renderer-specific decisions into versioned
code while retaining explicit escape and capability boundaries.

**“Does the benchmark prove this works everywhere?”**  
No. It establishes advantages in the reported local-agent and locked
development conditions. Hosted models, a fresh v0.2 holdout, people, and blind
cartographer review remain open.

**“Can it replace GIS or 3D simulation?”**  
No. It can structure deterministic 2D spatial analyses and explanations, but
physics-heavy shadow, surveillance, visibility, and routing decisions still
depend on suitable geometry, models, uncertainty, and domain validation.
