import { describe, expect, it } from 'vitest';

import { buildCorpusArtifacts } from './corpus.js';
import { prepareManifest, rebaseManifestPaths } from './prepare.js';

describe('AtlasBench corpus run preparation', () => {
  it('materializes a development run without mutating the frozen source', () => {
    const source = buildCorpusArtifacts().development;
    const prepared = prepareManifest(source, {
      provider: 'openai',
      model: 'gpt-snapshot',
      version: 'gpt-snapshot',
    });

    expect(prepared.model).toEqual({
      provider: 'openai',
      model: 'gpt-snapshot',
      version: 'gpt-snapshot',
    });
    expect(source.model.provider).toBe('replace-with-provider');
    expect(prepared.tasks).toEqual(source.tasks);
  });

  it('requires an explicit acknowledgement before exposing holdout', () => {
    const source = buildCorpusArtifacts().holdout;
    const options = {
      provider: 'openai',
      model: 'gpt-snapshot',
      version: 'gpt-snapshot',
    };

    expect(() => prepareManifest(source, options)).toThrow(
      'requires --acknowledge-holdout-exposure',
    );
    expect(
      prepareManifest(source, {
        ...options,
        acknowledge_holdout_exposure: true,
      }).tasks,
    ).toHaveLength(12);
  });

  it('rejects empty or placeholder model identities', () => {
    const source = buildCorpusArtifacts().development;
    expect(() =>
      prepareManifest(source, {
        provider: 'openai',
        model: 'replace-with-model',
        version: 'snapshot',
      }),
    ).toThrow('must not contain placeholders');
    expect(() =>
      prepareManifest(source, {
        provider: ' ',
        model: 'model',
        version: 'snapshot',
      }),
    ).toThrow('provider must not be empty');
  });

  it('rebases data and reference paths when the run manifest moves', () => {
    const source = buildCorpusArtifacts().development;
    const rebased = rebaseManifestPaths(
      source,
      'C:/repo/benchmark/corpus',
      'C:/repo/work',
    );

    expect(rebased.tasks[0]?.data_files[0]).toBe(
      `../benchmark/corpus/${source.tasks[0]?.data_files[0]}`,
    );
    expect(rebased.tasks[0]?.conditions[0]?.reference_files?.[0]).toBe(
      '../benchmark/references/maplibre.md',
    );
    expect(source.tasks[0]?.data_files[0]).toMatch(/^data\//);
  });
});
