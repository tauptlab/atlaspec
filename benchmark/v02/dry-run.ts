import { compileMapLibre } from '../../src/maplibre.js';
import { compileVegaLite } from '../../src/vega-lite.js';
import { stringify } from 'yaml';

import { buildV02CorpusMatrix } from './corpus.js';
import { evaluateV02Output } from './evaluate.js';
import {
  buildV02Manifests,
  buildV02ReferenceDocument,
  type V02Condition,
} from './manifest.js';

export interface V02DryRunReport {
  version: '0.2';
  status: 'deterministic-dry-run';
  tasks: number;
  conditions: number;
  accepted: number;
  failed: Array<{ task_id: string; condition: V02Condition; checks: unknown[] }>;
  model_calls: 0;
}

export function runV02DryRun(): V02DryRunReport {
  const manifests = buildV02Manifests(buildV02CorpusMatrix());
  const tasks = [...manifests.development.tasks, ...manifests.holdout.tasks];
  let conditions = 0;
  let accepted = 0;
  const failed: V02DryRunReport['failed'] = [];

  for (const task of tasks) {
    const document = buildV02ReferenceDocument(task);
    const atlaspecOutput = stringify(document);
    const maplibre = compileMapLibre(document);
    const vegaLite = compileVegaLite(document);
    for (const condition of task.conditions) {
      conditions += 1;
      const output = referenceOutput(
        condition,
        atlaspecOutput,
        maplibre,
        vegaLite,
      );
      const evaluation = evaluateV02Output(condition, output, task);
      if (evaluation.accepted) {
        accepted += 1;
      } else {
        failed.push({ task_id: task.id, condition, checks: evaluation.checks });
      }
    }
  }

  return {
    version: '0.2',
    status: 'deterministic-dry-run',
    tasks: tasks.length,
    conditions,
    accepted,
    failed,
    model_calls: 0,
  };
}

if (process.argv[1]?.endsWith('dry-run.ts')) {
  const report = runV02DryRun();
  console.log(JSON.stringify(report, null, 2));
  if (report.failed.length > 0) process.exitCode = 1;
}

function referenceOutput(
  condition: V02Condition,
  atlaspec: string,
  maplibre: ReturnType<typeof compileMapLibre>,
  vegaLite: ReturnType<typeof compileVegaLite>,
): string {
  switch (condition) {
    case 'direct-maplibre':
    case 'direct-maplibre-repair':
      if (!maplibre.ok) throw new Error('Reference MapLibre compilation failed.');
      return JSON.stringify(maplibre.style);
    case 'direct-vega-lite':
    case 'direct-vega-lite-repair':
      if (!vegaLite.ok) throw new Error('Reference Vega-Lite compilation failed.');
      return JSON.stringify(vegaLite.spec);
    case 'atlaspec-maplibre':
    case 'atlaspec-maplibre-repair':
    case 'atlaspec-vega-lite':
    case 'atlaspec-vega-lite-repair':
    case 'atlaspec-repair':
    case 'vega-capability-negative':
      return atlaspec;
  }
}
