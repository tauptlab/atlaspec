# Security Policy

## Supported versions

Atlaspec is currently a research release candidate.

| Version | Supported |
|---|---|
| `0.2.0-rc.x` | Yes |
| `0.1.x` document compatibility | Best effort |
| Unreleased development snapshots | No |

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting flow:

<https://github.com/tauptlab/atlaspec/security/advisories/new>

Include:

- the affected version or commit;
- a minimal reproduction;
- the security impact;
- whether untrusted Atlaspec, YAML, GeoJSON, or renderer output is involved; and
- any suggested mitigation.

You should receive an initial acknowledgement within seven days. Because this
is a volunteer research project, remediation timelines depend on severity and
maintainer availability. Confirmed reports will be credited unless the reporter
requests anonymity.

## Scope

Security-relevant areas include parsing untrusted YAML or GeoJSON, generated
renderer artifacts, CLI file handling, benchmark adapters, and supply-chain
dependencies. Incorrect cartographic output without a security consequence
should be reported with the bug template instead.

