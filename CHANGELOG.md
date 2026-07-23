# Changelog

All notable Atlaspec package and document-contract changes are recorded here.

## [0.2.0-rc.1] - 2026-07-23

Atlaspec 0.2 is now the latest document version. This package remains a
research release candidate because the sealed v0.2 holdout has not been
executed and one precommitted development token-efficiency gate remains open.

### Added

- ordered multi-layer Atlaspec 0.2 documents with stable layer IDs and purpose;
- deterministic multi-layer MapLibre compilation and decision tracing;
- a fail-closed portable Vega-Lite v6 subset with capability inspection;
- guarded 0.1-to-0.2 upgrade and representable single-layer downgrade;
- localized edit-survival and cross-renderer semantic-record evaluation;
- real MapLibre and Vega renderer evidence with label, placement, clipping,
  duplicate, and point-symbol occlusion gates;
- public package and document-version constants.

### Changed

- proportional-symbol labels in v0.2 use maximum-radius clearance to avoid
  occluding neighboring circles;
- the generated agent reference is schema-derived and version checked;
- Atlaspec 0.2 is the recommended document format for new multi-layer work.

### Compatibility

- Atlaspec 0.1 validation, TypeScript exports, migration, and MapLibre
  compilation remain supported;
- frozen 0.1 compiler fixtures remain byte-for-byte deterministic;
- the default CLI compiler target remains MapLibre.

### Evidence boundary

- the locked v0.2 development renderer verdict is 68/72 healthy Atlaspec
  outputs versus 40/72 direct-renderer outputs;
- a post-selected compiler remediation replay reached 72/72 Atlaspec outputs;
- the latter is repair verification, not a fresh unbiased benchmark estimate;
- stable `0.2.0` remains gated on the precommitted release contract.
