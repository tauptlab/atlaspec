# Atlaspec Evidence Lab

The Evidence Lab is a dependency-free GitHub Pages demo with two deliberately
separate forms of evidence:

1. the recorded, locked v0.2 renderer benchmark; and
2. deterministic spatial solvers that run locally in the visitor's browser.

The recorded benchmark compares agent-authored Atlaspec documents with direct
renderer code. The live lab demonstrates shadow projection, sampled CCTV
visibility, and constrained routing. Its timing result measures only those
browser solvers; it is not an LLM latency or model-accuracy benchmark.

## Run locally

From the repository root:

```powershell
python -m http.server 4173 --directory demo
```

Then open <http://127.0.0.1:4173/>.

## Verify

```powershell
npm run demo:test
```

The tests lock solar-position plausibility, deterministic shadow geometry,
monotonic CCTV coverage under a wider field of view, and accessibility-aware
routing.

## Publish

Pushes to `main` that touch `demo/**` or
`.github/workflows/pages.yml` run the Pages workflow. The expected public URL
is <https://tauptlab.github.io/atlaspec/>.

The workflow asks GitHub to enable Pages with **GitHub Actions** as its source
when the site does not exist yet. If repository policy blocks automatic
enablement, select that source once under **Settings → Pages** and rerun the
workflow.
