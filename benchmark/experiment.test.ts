import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ReplayGenerationAdapter } from './adapters.js';
import { runExperiment } from './experiment.js';
import type { GenerationResponse } from './protocol.js';

describe('AtlasBench comparison runner', () => {
  it('keeps the checked-in comparison manifest executable', async () => {
    const report = await runExperiment(
      resolve('benchmark', 'comparison.example.json'),
      new ReplayGenerationAdapter([]),
    );

    expect(report.runs).toHaveLength(20);
    expect(report.runs.every((run) => !run.final_accepted)).toBe(true);
    expect(report.summaries.map((summary) => summary.condition)).toEqual([
      'direct-maplibre',
      'direct-vega-lite',
      'atlaspec',
      'atlaspec-repair',
    ]);
    expect(
      report.runs[0]?.attempts[0]?.request.inputs.map((input) => input.role),
    ).toEqual(['data', 'reference']);
  });

  it('preserves first failures, performs one declared repair, and accounts cost', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'atlasbench-'));
    const manifestPath = join(directory, 'manifest.json');
    const inputPath = resolve('examples', 'data', 'districts.geojson');
    const validAtlaspec = await readFile(
      resolve('examples', 'flood-risk.atlas.yaml'),
      'utf8',
    );
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: '0.1',
        suite: 'comparison-pilot',
        repetitions: 1,
        model: { provider: 'fixture', model: 'replay', version: '1' },
        sampling: { temperature: 0, seed: 42 },
        tasks: [
          {
            id: 'flood-risk',
            family: 'choropleth',
            data_files: [inputPath],
            conditions: [
              {
                condition: 'atlaspec',
                prompt: 'Return Atlaspec.',
                requirements: {
                  maplibre_layer_types: ['fill'],
                  atlaspec_decisions: ['color.palette-inferred'],
                },
              },
              {
                condition: 'atlaspec-repair',
                prompt: 'Return Atlaspec and repair it once if required.',
                requirements: {
                  maplibre_layer_types: ['fill'],
                  atlaspec_decisions: ['color.palette-inferred'],
                },
              },
            ],
          },
        ],
      }),
      'utf8',
    );

    const responses: GenerationResponse[] = [
      response('comparison-pilot/flood-risk/atlaspec/1/1', validAtlaspec, 1),
      response(
        'comparison-pilot/flood-risk/atlaspec-repair/1/1',
        'not: valid atlaspec',
        2,
      ),
      response(
        'comparison-pilot/flood-risk/atlaspec-repair/1/2',
        validAtlaspec,
        3,
      ),
    ];
    const report = await runExperiment(
      manifestPath,
      new ReplayGenerationAdapter(responses),
    );

    expect(report.runs).toHaveLength(2);
    const repaired = report.runs[1];
    expect(repaired).toEqual(
      expect.objectContaining({
        first_attempt_accepted: false,
        final_accepted: true,
        repair_iterations: 1,
      }),
    );
    expect(repaired?.attempts).toHaveLength(2);
    expect(repaired?.attempts[1]?.request.diagnostics).not.toHaveLength(0);
    expect(repaired?.attempts[1]?.request.prompt).toContain('Previous output');

    expect(report.summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          condition: 'atlaspec',
          reliable_map_yield: 1,
          charge_usd: 1,
          cost_per_accepted_map: 1,
        }),
        expect.objectContaining({
          condition: 'atlaspec-repair',
          reliable_map_yield: 0,
          final_yield: 1,
          repair_iterations: 1,
          charge_usd: 5,
          cost_per_accepted_map: 5,
        }),
      ]),
    );
    expect(report.runs[0]?.attempts[0]?.request.inputs[0]).toEqual(
      expect.objectContaining({
        role: 'data',
        media_type: 'application/geo+json',
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('counts transport failures without an undeclared retry', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'atlasbench-'));
    const manifestPath = join(directory, 'manifest.json');
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: '0.1',
        suite: 'transport-pilot',
        repetitions: 1,
        model: { provider: 'fixture', model: 'missing', version: '1' },
        sampling: { temperature: 0 },
        tasks: [
          {
            id: 'flood-risk',
            family: 'choropleth',
            data_files: [resolve('examples', 'data', 'districts.geojson')],
            conditions: [
              {
                condition: 'direct-maplibre',
                prompt: 'Return MapLibre JSON.',
                requirements: { maplibre_layer_types: ['fill'] },
              },
            ],
          },
        ],
      }),
      'utf8',
    );

    const report = await runExperiment(
      manifestPath,
      new ReplayGenerationAdapter([]),
    );
    expect(report.summaries[0]).toEqual(
      expect.objectContaining({
        attempted: 1,
        reliable_map_yield: 0,
        final_yield: 0,
        cost_per_accepted_map: null,
      }),
    );
    expect(report.runs[0]?.attempts[0]).toEqual(
      expect.objectContaining({
        accepted: false,
        transport_error: expect.stringContaining('Replay has no response'),
      }),
    );
  });
});

function response(
  requestId: string,
  output: string,
  charge: number,
): GenerationResponse {
  return {
    schema_version: '0.1',
    request_id: requestId,
    resolved_model: { provider: 'fixture', model: 'replay', version: '1' },
    output,
    finish_reason: 'stop',
    usage: { input_tokens: 100, output_tokens: 50 },
    latency_ms: 20,
    pricing: {
      currency: 'USD',
      input_usd_per_million: 0,
      cached_input_usd_per_million: 0,
      output_usd_per_million: 0,
      source: 'fixture override',
    },
    charge_usd: charge,
    tool_calls: 0,
  };
}
