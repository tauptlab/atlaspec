export const COMPOSITION_ARCHETYPES = [
  'choropleth-proportional-symbols',
  'choropleth-categorical-facilities',
  'heatmap-reference-points',
  'operational-overview',
] as const;

export const V02_DIFFICULTIES = [
  'basic',
  'intermediate',
  'adversarial',
] as const;

export const V02_VARIANTS = [
  'canonical',
  'missing-and-skew',
  'dense-multilingual-mobile',
  'geographic-capability-boundary',
] as const;

export type CompositionArchetype = (typeof COMPOSITION_ARCHETYPES)[number];
export type V02Difficulty = (typeof V02_DIFFICULTIES)[number];
export type V02Variant = (typeof V02_VARIANTS)[number];
export type V02Split = 'development' | 'holdout';

export interface V02CorpusTask {
  id: string;
  archetype: CompositionArchetype;
  difficulty: V02Difficulty;
  variant: V02Variant;
  split: V02Split;
  portability: 'representable' | 'capability-negative';
  layer_count: number;
  edit_target: string;
  data_files: string[];
  stressors: string[];
}

export interface V02CorpusMatrix {
  version: '0.2';
  corpus: 'atlasbench-v02-48';
  repetitions: 5;
  bootstrap_seed: 2803528194;
  split_policy: string;
  status: 'runner-ready-model-runs-pending';
  tasks: V02CorpusTask[];
}

export interface V02FeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: Record<string, unknown>;
    properties: Record<string, unknown>;
  }>;
}

const LAYER_COUNTS: Record<CompositionArchetype, number> = {
  'choropleth-proportional-symbols': 2,
  'choropleth-categorical-facilities': 2,
  'heatmap-reference-points': 2,
  'operational-overview': 3,
};

const EDIT_TARGETS: Record<CompositionArchetype, string> = {
  'choropleth-proportional-symbols': 'sites',
  'choropleth-categorical-facilities': 'facilities',
  'heatmap-reference-points': 'reference-points',
  'operational-overview': 'facilities',
};

export function buildV02CorpusMatrix(): V02CorpusMatrix {
  const tasks: V02CorpusTask[] = [];
  for (const [archetypeIndex, archetype] of COMPOSITION_ARCHETYPES.entries()) {
    for (const [difficultyIndex, difficulty] of V02_DIFFICULTIES.entries()) {
      const holdoutVariantIndex =
        (archetypeIndex + difficultyIndex) % V02_VARIANTS.length;
      for (const [variantIndex, variant] of V02_VARIANTS.entries()) {
        tasks.push({
          id: `${archetype}-${difficulty}-${variant}`,
          archetype,
          difficulty,
          variant,
          split:
            variantIndex === holdoutVariantIndex ? 'holdout' : 'development',
          portability: portability(archetype, difficulty, variant),
          layer_count: LAYER_COUNTS[archetype],
          edit_target: EDIT_TARGETS[archetype],
          data_files: dataFiles(archetype, variant),
          stressors: stressors(difficulty, variant),
        });
      }
    }
  }

  return {
    version: '0.2',
    corpus: 'atlasbench-v02-48',
    repetitions: 5,
    bootstrap_seed: 2803528194,
    split_policy:
      'One deterministically rotated variant per archetype-difficulty cell is held out; each variant appears exactly three times in holdout.',
    status: 'runner-ready-model-runs-pending',
    tasks,
  };
}

export function buildV02Datasets(
  matrix = buildV02CorpusMatrix(),
): ReadonlyMap<string, V02FeatureCollection> {
  const datasets = new Map<string, V02FeatureCollection>();
  for (const task of matrix.tasks) {
    for (const path of task.data_files) {
      if (!datasets.has(path)) {
        datasets.set(path, dataset(task.archetype, task.variant, path));
      }
    }
  }
  return datasets;
}

export function validateV02CorpusMatrix(matrix: V02CorpusMatrix): string[] {
  const diagnostics: string[] = [];
  const ids = new Set<string>();
  const cells = new Set<string>();
  const holdoutByArchetypeDifficulty = new Map<string, number>();
  const holdoutByVariant = new Map<V02Variant, number>();

  if (matrix.tasks.length !== 48) {
    diagnostics.push(`matrix.count expected=48 actual=${matrix.tasks.length}`);
  }
  for (const task of matrix.tasks) {
    if (ids.has(task.id)) diagnostics.push(`matrix.duplicate-id ${task.id}`);
    ids.add(task.id);
    const cell = `${task.archetype}/${task.difficulty}/${task.variant}`;
    if (cells.has(cell)) diagnostics.push(`matrix.duplicate-cell ${cell}`);
    cells.add(cell);
    if (task.split === 'holdout') {
      const group = `${task.archetype}/${task.difficulty}`;
      holdoutByArchetypeDifficulty.set(
        group,
        (holdoutByArchetypeDifficulty.get(group) ?? 0) + 1,
      );
      holdoutByVariant.set(
        task.variant,
        (holdoutByVariant.get(task.variant) ?? 0) + 1,
      );
    }
  }

  for (const archetype of COMPOSITION_ARCHETYPES) {
    for (const difficulty of V02_DIFFICULTIES) {
      for (const variant of V02_VARIANTS) {
        const cell = `${archetype}/${difficulty}/${variant}`;
        if (!cells.has(cell)) diagnostics.push(`matrix.missing-cell ${cell}`);
      }
      const group = `${archetype}/${difficulty}`;
      const count = holdoutByArchetypeDifficulty.get(group) ?? 0;
      if (count !== 1) {
        diagnostics.push(`matrix.holdout-per-group ${group}=${count}`);
      }
    }
  }
  for (const variant of V02_VARIANTS) {
    const count = holdoutByVariant.get(variant) ?? 0;
    if (count !== 3) {
      diagnostics.push(`matrix.holdout-per-variant ${variant}=${count}`);
    }
  }

  return diagnostics.sort();
}

function portability(
  archetype: CompositionArchetype,
  difficulty: V02Difficulty,
  variant: V02Variant,
): V02CorpusTask['portability'] {
  return archetype === 'heatmap-reference-points' ||
    archetype === 'operational-overview' ||
    (difficulty === 'adversarial' &&
      variant === 'geographic-capability-boundary')
    ? 'capability-negative'
    : 'representable';
}

function dataFiles(
  archetype: CompositionArchetype,
  variant: V02Variant,
): string[] {
  const root = `data/${archetype}/${variant}`;
  return archetype === 'operational-overview'
    ? [`${root}/areas.geojson`, `${root}/incidents.geojson`, `${root}/facilities.geojson`]
    : [`${root}/areas.geojson`, `${root}/points.geojson`];
}

function stressors(
  difficulty: V02Difficulty,
  variant: V02Variant,
): string[] {
  const result =
    difficulty === 'basic'
      ? ['desktop-viewport']
      : difficulty === 'intermediate'
        ? ['layer-visibility', 'localized-edit']
        : ['mobile-viewport', 'conflicting-visibility', 'localized-edit'];
  switch (variant) {
    case 'canonical':
      return [...result, 'shared-source-baseline'];
    case 'missing-and-skew':
      return [...result, 'missing-values', 'skew', 'extreme-values'];
    case 'dense-multilingual-mobile':
      return [...result, 'dense-overlap', 'multilingual-labels', 'mobile'];
    case 'geographic-capability-boundary':
      return [...result, 'high-latitude', 'antimeridian', 'capability-boundary'];
  }
}

function dataset(
  archetype: CompositionArchetype,
  variant: V02Variant,
  path: string,
): V02FeatureCollection {
  const kind = path.split('/').at(-1)!.replace('.geojson', '');
  return kind === 'areas'
    ? areaDataset(variant, archetype === 'heatmap-reference-points')
    : pointDataset(variant, kind);
}

function areaDataset(
  variant: V02Variant,
  pointGeometry: boolean,
): V02FeatureCollection {
  if (pointGeometry) return pointDataset(variant, 'incidents');
  const centers: Array<[number, number]> =
    variant === 'geographic-capability-boundary'
      ? [
          [179.2, 72],
          [-179.4, 73],
          [170, 80],
          [-168, 78],
        ]
      : [
          [126.9, 37.5],
          [127.1, 37.5],
          [126.9, 37.7],
          [127.1, 37.7],
        ];
  return {
    type: 'FeatureCollection',
    features: centers.map(([longitude, latitude], index) => {
      const properties: Record<string, unknown> = {
        name: label(variant, 'District', index),
        risk_rate: [0.08, 0.24, 0.51, 0.86][index],
        demand_rate: [0.18, 0.37, 0.64, 0.92][index],
      };
      if (variant === 'missing-and-skew') {
        if (index === 1) delete properties['risk_rate'];
        if (index === 3) properties['demand_rate'] = 0.995;
      }
      const delta = 0.08;
      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [longitude - delta, latitude - delta],
            [longitude + delta, latitude - delta],
            [longitude + delta, latitude + delta],
            [longitude - delta, latitude + delta],
            [longitude - delta, latitude - delta],
          ]],
        },
        properties,
      };
    }),
  };
}

function pointDataset(
  variant: V02Variant,
  kind: string,
): V02FeatureCollection {
  const count = kind === 'incidents' ? 12 : 6;
  const center =
    variant === 'geographic-capability-boundary'
      ? [179.4, 76]
      : [127.0, 37.6];
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: count }, (_unused, index) => {
      const dense = variant === 'dense-multilingual-mobile';
      const longitude = center[0]! + (dense ? index * 0.0002 : (index % 4) * 0.025);
      const latitude = center[1]! + (dense ? index * 0.00015 : Math.floor(index / 4) * 0.025);
      const properties: Record<string, unknown> = {
        name: label(variant, kind, index),
        capacity: [12, 35, 80, 160, 420, 900][index % 6],
        category: ['clinic', 'shelter', 'depot'][index % 3],
        severity: (index % 5) + 1,
        reference_type: ['hospital', 'school', 'station'][index % 3],
        status: ['open', 'limited', 'closed'][index % 3],
      };
      if (variant === 'missing-and-skew') {
        if (index === 1) {
          delete properties[
            kind === 'facilities'
              ? 'category'
              : kind === 'incidents'
                ? 'severity'
                : 'capacity'
          ];
        }
        if (index === count - 1) properties['capacity'] = 10000;
      }
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point', coordinates: [longitude, latitude] },
        properties,
      };
    }),
  };
}

function label(variant: V02Variant, prefix: string, index: number): string {
  return variant === 'dense-multilingual-mobile'
    ? `${prefix} ${index + 1} 긴급대응 거점 Emergency Response Location`
    : `${prefix} ${index + 1}`;
}
