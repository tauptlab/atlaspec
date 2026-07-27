# Spatial-analysis experiment

This directory preserves the deterministic solar-shadow, sampled CCTV
visibility, and constrained-routing browser solvers that were previously shown
in the Atlaspec Evidence Lab.

They are **not part of the Atlaspec 0.2 language, compiler, or benchmark**.
Routing and spatial analysis remain explicit non-goals in
[`docs/SCOPE_0.2.md`](../../docs/SCOPE_0.2.md). The code is retained only as an
exploration of a possible future text-to-evidence layer that would require its
own scope, data contracts, solvers, validation, and evaluation.

Run the isolated deterministic tests with:

```powershell
node --test experiments/spatial-analysis/engine.test.js
```

Results from this experiment must not be presented as Atlaspec compiler
capabilities or included in Atlaspec renderer benchmark claims.
