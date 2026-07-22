# AtlasBench 0.2 Vega-Lite render-health evidence

Date: 2026-07-22

## Verdict

The post-hardening local qualification now has real Vega-Lite/Vega render
evidence for every source-accepted Vega-Lite generation. Across the six frozen
Codex and Claude job reports:

- 48 runs were assigned a renderable Vega-Lite condition;
- 39 passed the existing generation, compiler, and semantic evaluation;
- all 39 source-accepted runs produced a non-empty SVG with actual data marks;
- no source-accepted output failed the new render-health checks;
- the other 9 were preserved as source-generation failures and were not
  reclassified or rendered.

This closes the specific gap between “the specification compiles” and “the
preserved GeoJSON actually reaches the Vega runtime.” It does not close the
broader visual-quality or human-accuracy gates.

## Condition results

| Local agent and condition | Source accepted | Render-health pass |
|---|---:|---:|
| Claude / Atlaspec to Vega-Lite | 12/12 | 12/12 |
| Claude / direct Vega-Lite | 7/12 | 7/7 accepted outputs |
| Codex / Atlaspec to Vega-Lite | 12/12 | 12/12 |
| Codex / direct Vega-Lite | 8/12 | 8/8 accepted outputs |
| **Total** | **39/48** | **39/39 accepted outputs** |

The 24/24 versus 15/24 generation difference is not a new visual-quality
result; it is the existing source evaluator outcome viewed at the renderable
slice. The new evidence is that all 39 accepted outputs survived real runtime
execution with their preserved data.

## Render-health observations

- SVG artifacts: 39.
- Vega/Vega-Lite warnings among rendered outputs: 0.
- Rendered data marks per SVG: 13 to 16.
- Embedded source records resolved per SVG: 10 to 20.
- SVG size: 12,473 to 15,330 bytes.
- Every SVG had a positive viewport, at least one role-mark container, at least
  one rendered data mark, and accessibility labels covering the data marks.

An implementation probe exposed why this check is necessary: compiling a
Vega-Lite specification with a valid relative GeoJSON URL against the wrong
base directory can still yield a syntactically valid but empty SVG. The
render-evidence path prevents that silent failure by replacing each referenced
data URL with the exact input artifact retained in the original model request.
An unmatched URL fails closed.

## Provenance

- Render evaluator commit:
  `35e69711ddc7d218f6b1d1adbd02f202a76d9a85`.
- Evaluator dirty state: `false`.
- Frozen source compiler commit recorded by all six reports:
  `587f6e475c95b07a264d7bca2a8281b6278bf35c`.
- Evidence report:
  `work/v02-render-evidence-v1/render-evidence.json`.
- Evidence report SHA-256:
  `732e8cd406d93726733e221c9b45f20100849444dab4cc42e8ef0b23ec81729c`.

The git-ignored evidence bundle also contains each SVG and records its own
SHA-256, the source-report hash, model identity, source compiler commit, render
metrics, warnings, checks, and artifact path.

The evidence was generated with:

```powershell
npm run benchmark:v02:render -- `
  --report work/v02-qualification-v2/reports/claude/basic.json `
  --report work/v02-qualification-v2/reports/claude/intermediate.json `
  --report work/v02-qualification-v2/reports/claude/adversarial.json `
  --report work/v02-qualification-v2/reports/codex/basic.json `
  --report work/v02-qualification-v2/reports/codex/intermediate.json `
  --report work/v02-qualification-v2/reports/codex/adversarial.json `
  --output work/v02-render-evidence-v1
```

## Claim boundary and next gate

SVG health does not establish correct visual hierarchy, absence of label
overlap, antimeridian quality, color contrast, equivalent appearance across
renderers, or human map-reading accuracy. In particular, a mark can exist in
the SVG while being too small, occluded, or badly positioned.

The next visual-evidence slice should therefore add geometry-level screenshot
checks and a browser-backed MapLibre renderer under the same immutable report
contract. Blinded human and cartographer review remains a later external gate.
