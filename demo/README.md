# Atlaspec Compiler Lab

The public GitHub Pages site demonstrates the actual Atlaspec 0.2 product
boundary:

1. semantic map documents;
2. schema and cartographic linting;
3. deterministic compiler decisions; and
4. renderer artifacts.

`data/compiler-examples.json` is generated from the repository compiler. The
browser displays that checked snapshot and does not claim to execute an LLM or
replace the authoritative CLI.

The page reports two evidence classes separately:

- the one-time 12-task local holdout, with its task-level and model boundaries;
- the locked v0.2 development renderer diagnostic, explicitly labeled as
  correlated, project-authored evaluation rather than a sealed holdout.

Routing, shadows, CCTV visibility, and general spatial analysis are not
Atlaspec 0.2 capabilities. The earlier browser solvers are preserved under
[`experiments/spatial-analysis`](../experiments/spatial-analysis) and are not
deployed as the product demo.

## Regenerate and verify

```powershell
npm run demo:generate
npm run demo:test
```

`demo:test` fails when the generated compiler snapshot is stale, the public
scope drifts into spatial-analysis claims, or browser assets are not
cache-versioned.

## Run locally

```powershell
python -m http.server 4173 --directory demo
```

Then open <http://127.0.0.1:4173/>.

Pushes to `main` that touch `demo/**` or `.github/workflows/pages.yml` run the
Pages workflow. The expected public URL is
<https://tauptlab.github.io/atlaspec/>.
