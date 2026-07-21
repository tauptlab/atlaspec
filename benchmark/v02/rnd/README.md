# AtlasBench 0.2 post-qualification R&D

This directory contains precommitted development-only diagnostic matrices.
They may reuse tasks after qualification failures have been inspected, so their
results are engineering evidence rather than official benchmark evidence.

`reference-hardening-matrix-v1.json` broadens the first five targeted
regressions to all 12 qualification development tasks. It runs only Atlaspec
conditions, once per local agent:

- 12 MapLibre generation and localized-edit runs;
- 6 representable Vega-Lite portability runs;
- 6 Vega-Lite capability-negative runs.

That is 24 condition runs per agent and 48 total, with at most 72 model calls.
The fresh v0.2 holdout is explicitly out of scope and must remain sealed.

The matrix completed 48/48 condition runs and 24/24 localized edits on
2026-07-21. Both agents passed every locked diagnostic threshold. See the
[expanded R&D report](../../../docs/V02_REFERENCE_HARDENING_MATRIX_RND_2026-07-21.md)
for immutable hashes, token accounting, and the post-selected evidence boundary.

`compact-reference-v1.json` locks a MapLibre-only diagnostic for the
schema-derived compact reference. It compares token accounting to the immutable
post-hardening qualification reports while treating that comparison as
historical, not concurrently randomized evidence. Reliability and edit
survival remain mandatory gates; token savings cannot compensate for invalid
or unstable Atlaspec output.
