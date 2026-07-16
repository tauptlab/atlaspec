import type { ExperimentManifest } from '../experiment.js';
import type { BenchmarkCondition } from '../protocol.js';
import type { MapFamily } from '../../src/schema.js';

export const FAMILIES = [
  'choropleth',
  'proportional-symbol',
  'categorical-point',
  'heatmap',
] as const satisfies readonly MapFamily[];

export const DIFFICULTIES = [
  'basic',
  'intermediate',
  'adversarial',
] as const;

export const VARIANTS = [
  'canonical',
  'missing-values',
  'distribution-stress',
  'geographic-stress',
] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];
export type DataVariant = (typeof VARIANTS)[number];
export type CorpusSplit = 'development' | 'holdout';

export interface CorpusTask {
  id: string;
  family: MapFamily;
  difficulty: Difficulty;
  variant: DataVariant;
  split: CorpusSplit;
  data_file: string;
}

export interface CorpusMatrix {
  version: '0.1';
  corpus: 'atlasbench-48';
  split_policy: string;
  tasks: CorpusTask[];
}

export interface CorpusArtifacts {
  matrix: CorpusMatrix;
  development: ExperimentManifest;
  holdout: ExperimentManifest;
  datasets: ReadonlyMap<string, FeatureCollection>;
}

interface FeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: Record<string, unknown>;
    properties: Record<string, unknown>;
  }>;
}

interface FamilyContract {
  fieldDescription: string;
  commonInstruction: string;
  maplibreLayerTypes: string[];
  vegaMarkTypes?: string[];
  atlaspecDecisions: string[];
}

const FAMILY_CONTRACTS: Record<MapFamily, FamilyContract> = {
  choropleth: {
    fieldDescription:
      'Polygon property risk_rate is a normalized probability in [0,1]; name is the label.',
    commonInstruction:
      'Create a polygon choropleth of risk_rate and label each region with name. Never treat risk_rate as a raw count.',
    maplibreLayerTypes: ['fill', 'symbol'],
    vegaMarkTypes: ['geoshape', 'text'],
    atlaspecDecisions: [
      'basemap.background-selected',
      'color.palette-inferred',
      'color.domain-selected',
    ],
  },
  'proportional-symbol': {
    fieldDescription:
      'Point property capacity is a nonnegative count of people; name is the label.',
    commonInstruction:
      'Create proportional point symbols for capacity and label each location with name. Symbol area, not radius, must be proportional to capacity.',
    maplibreLayerTypes: ['circle', 'symbol'],
    vegaMarkTypes: ['circle', 'text'],
    atlaspecDecisions: [
      'basemap.background-selected',
      'size.area-proportional-scale',
    ],
  },
  'categorical-point': {
    fieldDescription:
      'Point property category is nominal with domain clinic, shelter, depot; name is the label.',
    commonInstruction:
      'Create categorical point symbols for category and label each location with name. Use a colorblind-safe categorical palette.',
    maplibreLayerTypes: ['circle', 'symbol'],
    vegaMarkTypes: ['circle', 'text'],
    atlaspecDecisions: [
      'basemap.background-selected',
      'color.categorical-domain',
    ],
  },
  heatmap: {
    fieldDescription:
      'Point property severity is an ordinal weight from 1 through 5; name is an identifier.',
    commonInstruction:
      'Create a weighted geographic heatmap using severity. The result must communicate concentration rather than individual point magnitude.',
    maplibreLayerTypes: ['heatmap'],
    atlaspecDecisions: [
      'basemap.background-selected',
      'heatmap.kernel-defaults',
    ],
  },
};

export function buildCorpusArtifacts(): CorpusArtifacts {
  const tasks = buildTasks();
  return {
    matrix: {
      version: '0.1',
      corpus: 'atlasbench-48',
      split_policy:
        'One rotated variant per family-difficulty cell is held out; each variant appears three times in holdout.',
      tasks,
    },
    development: buildManifest(
      'atlasbench-48-development',
      tasks.filter((task) => task.split === 'development'),
    ),
    holdout: buildManifest(
      'atlasbench-48-holdout',
      tasks.filter((task) => task.split === 'holdout'),
    ),
    datasets: buildDatasets(),
  };
}

export function validateCorpusMatrix(matrix: CorpusMatrix): string[] {
  const diagnostics: string[] = [];
  if (matrix.tasks.length !== 48) {
    diagnostics.push(`matrix.count expected=48 actual=${matrix.tasks.length}`);
  }
  const ids = new Set<string>();
  const cells = new Set<string>();
  const holdoutByFamilyDifficulty = new Map<string, number>();
  const holdoutByVariant = new Map<DataVariant, number>();

  for (const task of matrix.tasks) {
    if (ids.has(task.id)) diagnostics.push(`matrix.duplicate-id ${task.id}`);
    ids.add(task.id);
    const cell = `${task.family}/${task.difficulty}/${task.variant}`;
    if (cells.has(cell)) diagnostics.push(`matrix.duplicate-cell ${cell}`);
    cells.add(cell);
    if (task.split === 'holdout') {
      const familyDifficulty = `${task.family}/${task.difficulty}`;
      holdoutByFamilyDifficulty.set(
        familyDifficulty,
        (holdoutByFamilyDifficulty.get(familyDifficulty) ?? 0) + 1,
      );
      holdoutByVariant.set(
        task.variant,
        (holdoutByVariant.get(task.variant) ?? 0) + 1,
      );
    }
  }

  for (const family of FAMILIES) {
    for (const difficulty of DIFFICULTIES) {
      for (const variant of VARIANTS) {
        const cell = `${family}/${difficulty}/${variant}`;
        if (!cells.has(cell)) diagnostics.push(`matrix.missing-cell ${cell}`);
      }
      const key = `${family}/${difficulty}`;
      const count = holdoutByFamilyDifficulty.get(key) ?? 0;
      if (count !== 1) {
        diagnostics.push(`matrix.holdout-per-family-difficulty ${key}=${count}`);
      }
    }
  }
  for (const variant of VARIANTS) {
    const count = holdoutByVariant.get(variant) ?? 0;
    if (count !== 3) {
      diagnostics.push(`matrix.holdout-per-variant ${variant}=${count}`);
    }
  }
  return diagnostics.sort();
}

function buildTasks(): CorpusTask[] {
  const tasks: CorpusTask[] = [];
  for (const [familyIndex, family] of FAMILIES.entries()) {
    for (const [difficultyIndex, difficulty] of DIFFICULTIES.entries()) {
      const holdoutVariantIndex = (familyIndex + difficultyIndex) % VARIANTS.length;
      for (const [variantIndex, variant] of VARIANTS.entries()) {
        tasks.push({
          id: `${family}-${difficulty}-${variant}`,
          family,
          difficulty,
          variant,
          split: variantIndex === holdoutVariantIndex ? 'holdout' : 'development',
          data_file: `data/${family}-${variant}.geojson`,
        });
      }
    }
  }
  return tasks;
}

function buildManifest(suite: string, tasks: readonly CorpusTask[]): ExperimentManifest {
  return {
    version: '0.1',
    suite,
    repetitions: 5,
    model: {
      provider: 'replace-with-provider',
      model: 'replace-with-model-or-snapshot',
      version: 'replace-with-provider-resolved-version',
    },
    sampling: { temperature: 0, max_output_tokens: 8000 },
    tasks: tasks.map((task) => experimentTask(task)),
  };
}

function experimentTask(task: CorpusTask): ExperimentManifest['tasks'][number] {
  const contract = FAMILY_CONTRACTS[task.family];
  const commonPrompt = [
    contract.fieldDescription,
    contract.commonInstruction,
    difficultyInstruction(task.difficulty),
    variantInstruction(task.variant),
    `Use the supplied GeoJSON input ${task.data_file}.`,
  ].join(' ');
  const conditions: ExperimentManifest['tasks'][number]['conditions'] = [
    condition(
      'direct-maplibre',
      `${commonPrompt} Return only a complete MapLibre Style Specification v8 JSON document.`,
      '../references/maplibre.md',
      { maplibre_layer_types: contract.maplibreLayerTypes },
    ),
  ];
  if (contract.vegaMarkTypes !== undefined) {
    conditions.push(
      condition(
        'direct-vega-lite',
        `${commonPrompt} Return only a complete Vega-Lite v6 JSON document.`,
        '../references/vega-lite.md',
        { vega_lite_mark_types: contract.vegaMarkTypes },
      ),
    );
  }
  const atlaspecRequirements = {
    maplibre_layer_types: contract.maplibreLayerTypes,
    atlaspec_decisions: contract.atlaspecDecisions,
  };
  conditions.push(
    condition(
      'atlaspec',
      `${commonPrompt} Return only a complete Atlaspec 0.1 YAML document.`,
      '../references/atlaspec.md',
      atlaspecRequirements,
    ),
    condition(
      'atlaspec-repair',
      `${commonPrompt} Return only a complete Atlaspec 0.1 YAML document.`,
      '../references/atlaspec.md',
      atlaspecRequirements,
    ),
  );
  return {
    id: task.id,
    family: task.family,
    data_files: [task.data_file],
    conditions,
  };
}

function condition(
  conditionName: BenchmarkCondition,
  prompt: string,
  referenceFile: string,
  requirements: {
    maplibre_layer_types?: string[];
    vega_lite_mark_types?: string[];
    atlaspec_decisions?: string[];
  },
): ExperimentManifest['tasks'][number]['conditions'][number] {
  return {
    condition: conditionName,
    prompt,
    reference_files: [referenceFile],
    requirements,
  };
}

function difficultyInstruction(difficulty: Difficulty): string {
  switch (difficulty) {
    case 'basic':
      return 'Use a 960 by 640 viewport, a light low-contrast background, and a clear legend.';
    case 'intermediate':
      return 'Use a 960 by 640 viewport, preserve readable labels, make missing values explicit, and add sensible semantic zoom behavior.';
    case 'adversarial':
      return 'Use a 360 by 640 mobile viewport, preserve multilingual labels, use colorblind-safe encodings, and avoid misleading treatment of missing or extreme values.';
  }
}

function variantInstruction(variant: DataVariant): string {
  switch (variant) {
    case 'canonical':
      return 'The data are well formed and moderately distributed.';
    case 'missing-values':
      return 'Some features omit the encoded property; show these features explicitly instead of coercing them to zero.';
    case 'distribution-stress':
      return 'The encoded values are highly skewed and include repeated or tightly clustered observations; keep the main pattern legible without hiding the extreme values.';
    case 'geographic-stress':
      return 'Features include high latitudes, antimeridian-adjacent coordinates, and long Korean and English labels; do not drop or rename them.';
  }
}

function buildDatasets(): ReadonlyMap<string, FeatureCollection> {
  const datasets = new Map<string, FeatureCollection>();
  for (const family of FAMILIES) {
    for (const variant of VARIANTS) {
      datasets.set(`data/${family}-${variant}.geojson`, dataset(family, variant));
    }
  }
  return datasets;
}

function dataset(family: MapFamily, variant: DataVariant): FeatureCollection {
  switch (family) {
    case 'choropleth':
      return polygonDataset(variant);
    case 'proportional-symbol':
      return pointDataset(variant, 'capacity');
    case 'categorical-point':
      return categoricalDataset(variant);
    case 'heatmap':
      return pointDataset(variant, 'severity');
  }
}

function polygonDataset(variant: DataVariant): FeatureCollection {
  const values = variant === 'distribution-stress'
    ? [0.01, 0.02, 0.03, 0.08, 0.55, 0.99]
    : [0.12, 0.25, 0.38, 0.51, 0.67, 0.82];
  return {
    type: 'FeatureCollection',
    features: values.map((value, index) => {
      const geographic = variant === 'geographic-stress';
      const longitude = geographic
        ? [178.2, 179.2, -179.8, -178.8, 170, 172][index]!
        : 126.5 + (index % 3) * 0.7;
      const latitude = geographic ? 78 + Math.floor(index / 3) * 1.2 : 36 + Math.floor(index / 3) * 0.7;
      const properties: Record<string, unknown> = {
        name: geographic
          ? [`동쪽 경계 지역 ${index + 1}`, `Western antimeridian district ${index + 1}`][index % 2]
          : `District ${index + 1}`,
        risk_rate: value,
      };
      if (variant === 'missing-values' && index === 2) delete properties['risk_rate'];
      const east = geographic && index === 1 ? -179.6 : longitude + 0.5;
      return feature(
        {
          type: 'Polygon',
          coordinates: [[
            [longitude, latitude],
            [east, latitude],
            [east, latitude + 0.5],
            [longitude, latitude + 0.5],
            [longitude, latitude],
          ]],
        },
        properties,
      );
    }),
  };
}

function pointDataset(
  variant: DataVariant,
  field: 'capacity' | 'severity',
): FeatureCollection {
  const values = field === 'capacity'
    ? variant === 'distribution-stress'
      ? [1, 2, 4, 9, 120, 2000]
      : [40, 80, 150, 260, 500, 900]
    : variant === 'distribution-stress'
      ? [1, 1, 1, 2, 4, 5]
      : [1, 2, 3, 4, 5, 3];
  return {
    type: 'FeatureCollection',
    features: values.map((value, index) => {
      const geographic = variant === 'geographic-stress';
      const clustered = variant === 'distribution-stress';
      const coordinates = geographic
        ? [[179.5, 80], [-179.5, 80.2], [170, 78], [-170, 79], [175, 81], [-175, 81.2]][index]!
        : clustered
          ? [127 + (index % 2) * 0.001, 37 + Math.floor(index / 2) * 0.001]
          : [126.8 + (index % 3) * 0.25, 36.8 + Math.floor(index / 3) * 0.25];
      const properties: Record<string, unknown> = {
        name: geographic
          ? `북극권 국제 대응 거점 International response site ${index + 1}`
          : `${field === 'capacity' ? 'Shelter' : 'Incident'} ${index + 1}`,
        [field]: value,
      };
      if (variant === 'missing-values' && index === 3) delete properties[field];
      return feature({ type: 'Point', coordinates }, properties);
    }),
  };
}

function categoricalDataset(variant: DataVariant): FeatureCollection {
  const categories = variant === 'distribution-stress'
    ? ['clinic', 'clinic', 'clinic', 'clinic', 'shelter', 'depot']
    : ['clinic', 'shelter', 'depot', 'clinic', 'shelter', 'depot'];
  return {
    type: 'FeatureCollection',
    features: categories.map((category, index) => {
      const geographic = variant === 'geographic-stress';
      const properties: Record<string, unknown> = {
        name: geographic
          ? `재난 대응 시설 Emergency coordination facility ${index + 1}`
          : `Facility ${index + 1}`,
        category,
      };
      if (variant === 'missing-values' && index === 1) delete properties['category'];
      return feature(
        {
          type: 'Point',
          coordinates: geographic
            ? [index % 2 === 0 ? 179 - index * 0.1 : -179 + index * 0.1, 77 + index * 0.5]
            : [126.9 + (index % 3) * 0.3, 37 + Math.floor(index / 3) * 0.3],
        },
        properties,
      );
    }),
  };
}

function feature(
  geometry: Record<string, unknown>,
  properties: Record<string, unknown>,
): FeatureCollection['features'][number] {
  return { type: 'Feature', geometry, properties };
}
