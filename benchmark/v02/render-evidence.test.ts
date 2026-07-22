import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { writeV02RenderEvidence } from './render-evidence.js';

describe('AtlasBench 0.2 render evidence bundle', () => {
  it('writes immutable SVG evidence from an accepted Vega-Lite run', async () => {
    const root = await mkdtemp(join(tmpdir(), 'atlaspec-render-evidence-'));
    const source = join(root, 'source.json');
    const output = join(root, 'evidence');
    const content = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [127, 37.5] },
          properties: { value: 4 },
        },
      ],
    });
    const spec = {
      width: 200,
      height: 120,
      projection: { type: 'mercator' },
      data: {
        url: 'data/point.geojson',
        format: { type: 'json', property: 'features' },
      },
      transform: [
        { calculate: 'datum.geometry.coordinates[0]', as: 'lon' },
        { calculate: 'datum.geometry.coordinates[1]', as: 'lat' },
      ],
      mark: 'circle',
      encoding: {
        longitude: { field: 'lon', type: 'quantitative' },
        latitude: { field: 'lat', type: 'quantitative' },
        size: { field: 'properties.value', type: 'quantitative' },
      },
    };
    const request = {
      inputs: [
        {
          path: 'data/point.geojson',
          role: 'data',
          media_type: 'application/geo+json',
          content,
          sha256: createHash('sha256').update(content).digest('hex'),
        },
      ],
    };
    const report = {
      schema_version: '0.2',
      suite: 'test',
      compiler_commit: 'source-commit',
      model: { provider: 'test', model: 'fixture', version: '1' },
      runs: [
        {
          run_id: 'test/task/direct-vega-lite/1',
          task_id: 'task',
          condition: 'direct-vega-lite',
          repetition: 1,
          attempts: [
            {
              stage: 'initial',
              accepted: true,
              request,
              response: { output: JSON.stringify(spec) },
            },
          ],
        },
      ],
    };

    try {
      await writeFile(source, JSON.stringify(report), 'utf8');
      const evidence = await writeV02RenderEvidence([source], output);

      expect(evidence.summary).toEqual({
        source_reports: 1,
        experiment_runs: 1,
        renderable_runs: 1,
        source_accepted_runs: 1,
        rendered: 1,
        passed: 1,
        failed: 0,
        skipped_source_failures: 0,
      });
      expect(evidence.evaluator.commit).toMatch(/^[a-f0-9]{40}$/);
      const artifact = evidence.entries[0]?.artifact;
      expect(artifact).not.toBeNull();
      expect(await readFile(join(output, artifact!), 'utf8')).toContain('<svg ');
      await expect(writeV02RenderEvidence([source], output)).rejects.toThrow(
        `Output already exists: ${output}`,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
