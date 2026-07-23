# Atlaspec 0.2 release-candidate verification

Date: 2026-07-23

## Verdict

Atlaspec document version `0.2` is confirmed as the latest recommended
document contract. Package `0.2.0-rc.1` passed the complete local technical,
renderer, packaging, installation, CLI, and public-API verification described
below.

Stable package `0.2.0` is not declared. This is an evidence-boundary decision,
not a technical test failure:

- the locked Codex development result reduced total uncached generation tokens
  by 3.21%, below the precommitted 25% release gate;
- the one-time v0.2 holdout therefore remains sealed;
- human map-reading accuracy and blind cartographer review remain unmeasured.

The release contract was not weakened after observing these results.

## Candidate identity

- Package: `atlaspec@0.2.0-rc.1`.
- Latest document version: `0.2`.
- Supported document versions: `0.1`, `0.2`.
- Clean candidate commit:
  `d70b3e0aa78fe4b7efe165845bfbde09c2397e49`.
- Git dirty state during final checks: `false`.
- Node.js: `v22.23.1`.
- npm: `11.7.0`.
- Platform: Windows, PowerShell.

## Final verification matrix

| Check | Result | Evidence |
|---|---|---|
| TypeScript typecheck | pass | zero diagnostics |
| Automated tests | pass | 42 files, 160 tests |
| v0.1 corpus integrity | pass | 48 tasks, 36 development, 12 holdout, 16 datasets |
| v0.2 corpus integrity | pass | 48 tasks, 36 development, 12 holdout, 22 portable, 36 datasets |
| Generated references | pass | full v0.1, full v0.2, compact v0.2 verified |
| Production build | pass | `tsc -p tsconfig.build.json` |
| v0.2 deterministic dry-run | pass | 214/214 conditions, zero model calls |
| Dependency audit | pass | zero known vulnerabilities |
| Browser reference calibration | pass | 36/36 development tasks |
| Package prepack build | pass | build runs automatically before packing |
| Tarball contents | pass | 52 files including README, changelog, license, declarations, maps |
| Fresh package installation | pass | empty consumer project |
| CLI version | pass | `0.2.0-rc.1` |
| Legacy v0.1 validation | pass | `flood-risk.atlas.yaml` |
| Current v0.2 validation | pass | `operations-overview.atlas.yaml` |
| 0.1 to 0.2 upgrade | pass | upgraded output validates as v0.2 |
| MapLibre compilation | pass | multi-layer operations overview |
| Vega-Lite compilation | pass | portable multi-layer overview |
| Capability fail-closed | pass | unsupported operations overview exits 1 for Vega-Lite |
| Installed public API | pass | version constants and both compiler functions imported |

## Immutable local artifacts

### Browser calibration

- Report:
  `work/v02-release-candidate-calibration-v2/calibration.json`.
- Report SHA-256:
  `1945689dc1132bd0220b443b4de6752c946085e40be34c8925a91a5d32767339`.
- Evaluator commit:
  `d70b3e0aa78fe4b7efe165845bfbde09c2397e49`.
- Evaluator dirty state: `false`.
- Browser: Google Chrome `150.0.7871.115`.
- Tasks: 36 development references.
- Passed: 36.
- Failed: 0.
- Holdout exposed: `false`.

### Installed package

- Tarball:
  `work/v02-release-smoke-rc1-final/atlaspec-0.2.0-rc.1.tgz`.
- Tarball SHA-256:
  `e22688c404903dfcd7151d746cf50aef9bd59b30037b92283bee8561c09c09be`.
- Tarball size: 47,823 bytes.
- Unpacked package files: 52.
- npm-reported unpacked size: approximately 261.2 kB.
- Fresh-install dependency audit: zero vulnerabilities.

The tarball is a local verification artifact. No npm publication, Git tag, or
GitHub release was created.

## Performance and claim boundary

The strongest unbiased v0.2 visual result remains the preregistered development
verdict:

- Atlaspec: 68/72 healthy real-renderer outputs;
- direct renderer generation: 40/72;
- observed difference: +38.89 percentage points.

The maximum-radius label-clearance remediation replay reached 72/72 Atlaspec
outputs. That result verifies the observed repair but is post-selected and is
not substituted for a fresh benchmark estimate.

The v0.1 one-time local holdout remains separate evidence. It is not reused as
v0.2 confirmation.

## Release-gate disposition

| Release area | Disposition |
|---|---|
| Schema and public API | pass |
| v0.1 compatibility | pass |
| MapLibre compiler | pass |
| Vega-Lite portable subset | pass |
| Capability fail-closed | pass |
| Deterministic corpus and evaluator | pass |
| Real-renderer development health | pass with documented post-fix boundary |
| Package construction and installation | pass |
| Documentation | pass |
| Claude locked development gates | pass |
| Codex total uncached-token gate | **fail: 3.21% vs 25% required** |
| One-time v0.2 holdout | **not run; sealed** |
| Human and blind expert evaluation | not yet measured |

## Version decision

The evidence supports:

- calling Atlaspec `0.2` the latest document version;
- recommending v0.2 for new multi-layer documents;
- distributing or testing package `0.2.0-rc.1` as a research candidate;
- retaining v0.1 as a supported compatibility branch.

The evidence does not support:

- tagging or publishing stable `0.2.0`;
- publishing the package under an npm `latest` tag;
- claiming model-independent cost reduction;
- claiming complete human or expert cartographic quality.

Stable `0.2.0` requires a new precommitted development qualification that
satisfies the unchanged token gate, followed by the one-time sealed holdout and
the remaining human/expert evidence required by the evaluation contract.

## Reproduction

```powershell
npm run release:verify
npm audit --audit-level=high
npm run benchmark:v02:render:calibrate -- `
  --output work/v02-release-candidate-calibration-v2
```

The package installation smoke used the tarball produced by `npm pack`, not the
source tree, and exercised validation, migration, MapLibre compilation,
Vega-Lite compilation, capability rejection, CLI versioning, and ESM imports.
