import type {
  CompositionArchetype,
  V02CorpusMatrix,
  V02CorpusTask,
} from './corpus.js';

export type V02Condition =
  | 'direct-maplibre'
  | 'direct-vega-lite'
  | 'atlaspec-maplibre'
  | 'atlaspec-vega-lite'
  | 'atlaspec-repair'
  | 'vega-capability-negative';

export interface V02LayerRequirement {
  id: string;
  purpose: 'primary' | 'supporting' | 'reference';
  family: 'choropleth' | 'proportional-symbol' | 'categorical-point' | 'heatmap';
  source: string;
  source_file: string;
  support: 'point' | 'polygon';
  bindings: Array<{
    channel: 'color' | 'size' | 'category' | 'label' | 'weight';
    field: string;
    path: string;
  }>;
  maplibre_types: string[];
  vega_marks: string[];
  missing_data: 'explicit' | 'hide' | 'error';
}

export interface V02ManifestTask {
  id: string;
  split: 'development' | 'holdout';
  prompt: string;
  edit_prompt: string;
  edit_target: string;
  portability: V02CorpusTask['portability'];
  data_files: string[];
  layers: V02LayerRequirement[];
  conditions: V02Condition[];
}

export interface V02EvaluationManifest {
  version: '0.2';
  suite: string;
  repetitions: 5;
  status: 'contract-locked-runner-pending';
  tasks: V02ManifestTask[];
}

export interface V02Manifests {
  development: V02EvaluationManifest;
  holdout: V02EvaluationManifest;
}

export function buildV02Manifests(matrix: V02CorpusMatrix): V02Manifests {
  const tasks = matrix.tasks.map((task) => manifestTask(task));
  return {
    development: manifest(
      'atlasbench-v02-48-development',
      tasks.filter((task) => task.split === 'development'),
    ),
    holdout: manifest(
      'atlasbench-v02-48-holdout',
      tasks.filter((task) => task.split === 'holdout'),
    ),
  };
}

export function validateV02Manifest(
  manifestValue: V02EvaluationManifest,
): string[] {
  const diagnostics: string[] = [];
  const ids = new Set<string>();
  for (const task of manifestValue.tasks) {
    if (ids.has(task.id)) diagnostics.push(`manifest.duplicate-task ${task.id}`);
    ids.add(task.id);
    if (task.layers.length < 2) diagnostics.push(`manifest.layer-count ${task.id}`);
    if (task.layers.filter((layer) => layer.purpose === 'primary').length !== 1) {
      diagnostics.push(`manifest.primary-count ${task.id}`);
    }
    if (!task.conditions.includes('direct-maplibre')) {
      diagnostics.push(`manifest.maplibre-baseline-missing ${task.id}`);
    }
    if (!task.conditions.includes('atlaspec-maplibre')) {
      diagnostics.push(`manifest.atlaspec-maplibre-missing ${task.id}`);
    }
    const portable = task.portability === 'representable';
    if (task.conditions.includes('direct-vega-lite') !== portable) {
      diagnostics.push(`manifest.vega-baseline-mismatch ${task.id}`);
    }
    if (task.conditions.includes('atlaspec-vega-lite') !== portable) {
      diagnostics.push(`manifest.atlaspec-vega-mismatch ${task.id}`);
    }
    if (task.conditions.includes('vega-capability-negative') === portable) {
      diagnostics.push(`manifest.capability-control-mismatch ${task.id}`);
    }
    const files = new Set(task.data_files);
    for (const layer of task.layers) {
      if (!files.has(layer.source_file)) {
        diagnostics.push(`manifest.unknown-source-file ${task.id}/${layer.id}`);
      }
    }
  }
  return diagnostics.sort();
}

function manifest(
  suite: string,
  tasks: V02ManifestTask[],
): V02EvaluationManifest {
  return {
    version: '0.2',
    suite,
    repetitions: 5,
    status: 'contract-locked-runner-pending',
    tasks,
  };
}

function manifestTask(task: V02CorpusTask): V02ManifestTask {
  const layers = layerRequirements(task.archetype, task.data_files);
  const layerInstruction = layers
    .map(
      (layer) =>
        `${layer.id} (${layer.purpose}) is a ${layer.family} using source ${layer.source} from ${layer.source_file}; ` +
        `bind ${layer.bindings.map((binding) => `${binding.channel}=${binding.path}`).join(', ')} and use missing_data=${layer.missing_data}`,
    )
    .join('. ');
  const prompt =
    `Create one ordered multi-layer map for task ${task.id}. ${layerInstruction}. ` +
    `Preserve layer order, source identities, field bindings, legends, and a 960 by 640 viewport. ` +
    `Stress requirements: ${task.stressors.join(', ')}.`;
  const conditions: V02Condition[] = [
    'direct-maplibre',
    'atlaspec-maplibre',
    'atlaspec-repair',
  ];
  if (task.portability === 'representable') {
    conditions.push('direct-vega-lite', 'atlaspec-vega-lite');
  } else {
    conditions.push('vega-capability-negative');
  }
  return {
    id: task.id,
    split: task.split,
    prompt,
    edit_prompt:
      `Change only layer ${task.edit_target} to hide missing encoded values. ` +
      'Do not rename, reorder, or alter any other semantic layer.',
    edit_target: task.edit_target,
    portability: task.portability,
    data_files: [...task.data_files],
    layers,
    conditions,
  };
}

function layerRequirements(
  archetype: CompositionArchetype,
  files: string[],
): V02LayerRequirement[] {
  const file = (suffix: string): string => files.find((path) => path.endsWith(`/${suffix}`))!;
  const choropleth = (
    id: string,
    purpose: V02LayerRequirement['purpose'],
    field: string,
    sourceFile = file('areas.geojson'),
  ): V02LayerRequirement => ({
    id,
    purpose,
    family: 'choropleth',
    source: 'areas',
    source_file: sourceFile,
    support: 'polygon',
    bindings: [{ channel: 'color', field, path: field }],
    maplibre_types: ['fill'],
    vega_marks: ['geoshape'],
    missing_data: 'explicit',
  });
  switch (archetype) {
    case 'choropleth-proportional-symbols':
      return [
        choropleth('risk', 'primary', 'risk_rate'),
        pointLayer('sites', 'supporting', 'proportional-symbol', 'points', file('points.geojson'), 'size', 'capacity'),
      ];
    case 'choropleth-categorical-facilities':
      return [
        choropleth('risk', 'primary', 'risk_rate'),
        pointLayer('facilities', 'supporting', 'categorical-point', 'facilities', file('points.geojson'), 'category', 'category'),
      ];
    case 'heatmap-reference-points':
      return [
        pointLayer('incidents', 'primary', 'heatmap', 'incidents', file('areas.geojson'), 'weight', 'severity'),
        pointLayer('reference-points', 'reference', 'categorical-point', 'references', file('points.geojson'), 'category', 'reference_type'),
      ];
    case 'operational-overview':
      return [
        choropleth('demand', 'primary', 'demand_rate'),
        pointLayer('incidents', 'supporting', 'heatmap', 'incidents', file('incidents.geojson'), 'weight', 'severity'),
        pointLayer('facilities', 'reference', 'categorical-point', 'facilities', file('facilities.geojson'), 'category', 'status'),
      ];
  }
}

function pointLayer(
  id: string,
  purpose: V02LayerRequirement['purpose'],
  family: V02LayerRequirement['family'],
  source: string,
  sourceFile: string,
  channel: 'size' | 'category' | 'weight',
  field: string,
): V02LayerRequirement {
  return {
    id,
    purpose,
    family,
    source,
    source_file: sourceFile,
    support: 'point',
    bindings: [
      { channel, field, path: field },
      { channel: 'label', field: 'name', path: 'name' },
    ],
    maplibre_types:
      family === 'heatmap' ? ['heatmap'] : ['circle', 'symbol'],
    vega_marks:
      family === 'heatmap' ? [] : ['circle', 'text'],
    missing_data: family === 'heatmap' ? 'hide' : 'error',
  };
}
