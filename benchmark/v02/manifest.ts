import type {
  CompositionArchetype,
  V02CorpusMatrix,
  V02CorpusTask,
} from './corpus.js';
import type {
  AtlaspecV02Document,
  Field,
} from '../../src/schema.js';

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
  capability_requirement:
    | null
    | { kind: 'unsupported-family'; layer_id: string; family: 'heatmap' }
    | {
        kind: 'unsupported-behavior';
        layer_id: string;
        action: 'cluster';
        target: 'symbols';
        max_zoom: 9;
      };
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
    if (portable !== (task.capability_requirement === null)) {
      diagnostics.push(`manifest.capability-requirement-mismatch ${task.id}`);
    }
    const files = new Set(task.data_files);
    for (const layer of task.layers) {
      if (!files.has(layer.source_file)) {
        diagnostics.push(`manifest.unknown-source-file ${task.id}/${layer.id}`);
      }
    }
    const editLayer = task.layers.find((layer) => layer.id === task.edit_target);
    if (editLayer === undefined) {
      diagnostics.push(`manifest.edit-target-missing ${task.id}/${task.edit_target}`);
    } else if (editLayer.missing_data === 'hide') {
      diagnostics.push(`manifest.edit-noop ${task.id}/${task.edit_target}`);
    }
  }
  return diagnostics.sort();
}

export function buildV02ReferenceDocument(
  task: V02ManifestTask,
): AtlaspecV02Document {
  const fields: Record<string, Field> = {};
  for (const layer of task.layers) {
    for (const binding of layer.bindings) {
      fields[binding.field] = referenceField(
        layer.source,
        binding.path,
      );
    }
  }
  return {
    version: '0.2',
    map: task.id,
    title: task.id.replaceAll('-', ' '),
    intent: {
      task: 'compare',
      audience: 'operations',
      primary_message: 'Preserve the locked multi-layer operational map contract.',
    },
    data: {
      sources: uniqueSources(task.layers).map((layer) => ({
        id: layer.source,
        type: 'geojson' as const,
        url: layer.source_file,
      })),
      fields,
    },
    layers: task.layers.map((layer) => ({
      id: layer.id,
      purpose: layer.purpose,
      family: layer.family,
      encoding: {
        geometry: { source: layer.source, support: layer.support },
        ...Object.fromEntries(
          layer.bindings.map((binding) => [
            binding.channel,
            { field: binding.field },
          ]),
        ),
      },
      constraints: {
        missing_data: layer.missing_data,
        ...(layer.family === 'choropleth'
          ? { raw_count_choropleth: 'reject' as const }
          : {}),
      },
      ...(task.capability_requirement?.kind === 'unsupported-behavior' &&
      layer.id === task.capability_requirement.layer_id
        ? {
            behavior: {
              zoom_rules: [
                {
                  max_zoom: task.capability_requirement.max_zoom,
                  target: task.capability_requirement.target,
                  action: task.capability_requirement.action,
                },
              ],
            },
          }
        : {}),
    })),
    constraints: {
      colorblind_safe: true,
      viewport: { width: 960, height: 640 },
    },
    basemap: { style: 'minimal-light', contrast: 'light' },
  };
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
  const capabilityRequirement = capabilityRequirementFor(task, layers);
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
    `Stress requirements: ${task.stressors.join(', ')}.` +
    capabilityInstruction(capabilityRequirement);
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
    capability_requirement: capabilityRequirement,
    data_files: [...task.data_files],
    layers,
    conditions,
  };
}

function capabilityRequirementFor(
  task: V02CorpusTask,
  layers: V02LayerRequirement[],
): V02ManifestTask['capability_requirement'] {
  if (task.portability === 'representable') return null;
  const heatmap = layers.find((layer) => layer.family === 'heatmap');
  if (heatmap !== undefined) {
    return { kind: 'unsupported-family', layer_id: heatmap.id, family: 'heatmap' };
  }
  const pointLayer = [...layers].reverse().find((layer) => layer.support === 'point');
  if (pointLayer === undefined) {
    throw new Error(`Capability-negative task has no point layer: ${task.id}`);
  }
  return {
    kind: 'unsupported-behavior',
    layer_id: pointLayer.id,
    action: 'cluster',
    target: 'symbols',
    max_zoom: 9,
  };
}

function capabilityInstruction(
  requirement: V02ManifestTask['capability_requirement'],
): string {
  if (requirement === null) return '';
  return requirement.kind === 'unsupported-family'
    ? ` Capability control: preserve layer ${requirement.layer_id} as a heatmap; do not approximate it with another family.`
    : ` Capability control: layer ${requirement.layer_id} must cluster symbols through zoom ${requirement.max_zoom}; do not silently omit or approximate this behavior.`;
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
    bindings:
      family === 'heatmap'
        ? [{ channel, field, path: field }]
        : [
            { channel, field, path: field },
            { channel: 'label', field: `${source}_name`, path: 'name' },
          ],
    maplibre_types:
      family === 'heatmap' ? ['heatmap'] : ['circle', 'symbol'],
    vega_marks:
      family === 'heatmap' ? [] : ['circle', 'text'],
    missing_data: family === 'heatmap' ? 'hide' : 'error',
  };
}

function uniqueSources(
  layers: V02LayerRequirement[],
): V02LayerRequirement[] {
  return [
    ...new Map(layers.map((layer) => [layer.source, layer])).values(),
  ];
}

function referenceField(source: string, path: string): Field {
  switch (path) {
    case 'risk_rate':
    case 'demand_rate':
      return {
        source,
        path,
        measurement: 'quantitative',
        semantic_type: 'probability',
        unit: 'ratio',
        normalization: 'ratio',
        range: [0, 1],
      };
    case 'capacity':
      return {
        source,
        path,
        measurement: 'quantitative',
        semantic_type: 'capacity',
        unit: 'people',
        normalization: 'none',
        range: [0, 10000],
      };
    case 'severity':
      return {
        source,
        path,
        measurement: 'ordinal',
        semantic_type: 'uncertainty',
        range: [1, 5],
      };
    case 'category':
      return nominalField(source, path, ['clinic', 'shelter', 'depot']);
    case 'reference_type':
      return nominalField(source, path, ['hospital', 'school', 'station']);
    case 'status':
      return nominalField(source, path, ['open', 'limited', 'closed']);
    case 'name':
      return {
        source,
        path,
        measurement: 'nominal',
        semantic_type: 'label',
      };
    default:
      throw new Error(`No AtlasBench 0.2 field contract for path '${path}'.`);
  }
}

function nominalField(source: string, path: string, domain: string[]): Field {
  return {
    source,
    path,
    measurement: 'nominal',
    semantic_type: 'category',
    domain,
  };
}
