import { describe, expect, it } from 'vitest';

import { buildCorpusArtifacts } from '../corpus/corpus.js';
import { buildOfficialDevelopmentBundle } from './plan.js';

describe('official benchmark development bundle', () => {
  it('shards every model and task while preserving locked call accounting', () => {
    const source = buildCorpusArtifacts().development;
    const bundle = buildOfficialDevelopmentBundle(plan(), source, {
      source_manifest_raw: JSON.stringify(source),
      source_directory: 'C:/repo/benchmark/corpus',
      output_directory: 'C:/repo/work/official',
      lockfile_raw: '{"lockfileVersion":3}',
      compiler_commit: 'abc123',
      generated_at: '2026-07-16T00:00:00.000Z',
    });

    expect(bundle.ledger.holdout_exposed).toBe(false);
    expect(bundle.ledger.totals).toEqual({
      jobs: 108,
      expected_runs: 2025,
      base_generation_calls: 2025,
      max_generation_calls: 2565,
    });
    expect(bundle.manifests).toHaveLength(108);
    const shard = bundle.manifests.get(
      'manifests/small/choropleth-basic-missing-values.json',
    );
    expect(shard?.tasks).toHaveLength(1);
    expect(shard?.repetitions).toBe(5);
    expect(bundle.ledger.jobs[0]?.manifest_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(shard?.tasks[0]?.data_files[0]).toMatch(
      /^\.\.\/\.\.\/\.\.\/\.\.\/benchmark\/corpus\/data\//,
    );
  });

  it('rejects missing strata, local agent wrappers, and placeholders', () => {
    const source = buildCorpusArtifacts().development;
    const options = {
      source_manifest_raw: JSON.stringify(source),
      source_directory: 'C:/repo/benchmark/corpus',
      output_directory: 'C:/repo/work/official',
      lockfile_raw: '{}',
      compiler_commit: 'abc123',
      generated_at: '2026-07-16T00:00:00.000Z',
    };
    const missing = plan();
    missing.models[2]!.stratum = 'mid-tier-hosted';
    expect(() => buildOfficialDevelopmentBundle(missing, source, options)).toThrow(
      'Missing official model stratum',
    );

    const cli = plan();
    cli.models[0]!.provider = 'codex-cli';
    expect(() => buildOfficialDevelopmentBundle(cli, source, options)).toThrow(
      'must use a raw model API',
    );

    const placeholder = plan();
    placeholder.models[0]!.version = 'replace-with-snapshot';
    expect(() => buildOfficialDevelopmentBundle(placeholder, source, options)).toThrow(
      'contains a placeholder',
    );
  });
});

function plan() {
  return {
    version: '0.1' as const,
    benchmark_id: 'atlasbench-official-2026',
    models: [
      model('small', 'small-or-local'),
      model('mid', 'mid-tier-hosted'),
      model('frontier', 'frontier-hosted'),
    ],
  };
}

function model(
  id: string,
  stratum: 'small-or-local' | 'mid-tier-hosted' | 'frontier-hosted',
) {
  return {
    id,
    stratum,
    provider: 'provider',
    model: `${id}-model`,
    version: `${id}-snapshot`,
    api_mode: 'raw-model-api' as const,
    cost_observed: true as const,
    pricing_source: `price-card-${id}`,
  };
}
