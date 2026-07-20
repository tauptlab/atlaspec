import type {
  AtlaspecDocument,
  AtlaspecV01Document,
  AtlaspecV02Document,
} from './schema.js';

export class AtlaspecMigrationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AtlaspecMigrationError';
  }
}

export function upgradeAtlaspec(
  document: AtlaspecDocument,
): AtlaspecV02Document {
  if (document.version === '0.2') {
    return structuredClone(document);
  }

  const { constraints, behavior, encoding, family, ...shared } = document;
  const globalConstraints = compact({
    colorblind_safe: constraints?.colorblind_safe,
    protected_layers:
      constraints?.protected_layers === undefined
        ? undefined
        : constraints.protected_layers.length === 0
          ? []
          : ['main'],
    label_priority: constraints?.label_priority,
    viewport: constraints?.viewport,
  });
  const layerConstraints = compact({
    missing_data: constraints?.missing_data,
    raw_count_choropleth: constraints?.raw_count_choropleth,
  });

  return {
    ...structuredClone(shared),
    version: '0.2',
    layers: [
      {
        id: 'main',
        purpose: 'primary',
        family,
        encoding: structuredClone(encoding),
        ...(Object.keys(layerConstraints).length === 0
          ? {}
          : { constraints: structuredClone(layerConstraints) }),
        ...(behavior === undefined
          ? {}
          : { behavior: structuredClone(behavior) }),
      },
    ],
    ...(Object.keys(globalConstraints).length === 0
      ? {}
      : { constraints: structuredClone(globalConstraints) }),
  };
}

export function downgradeAtlaspec(
  document: AtlaspecV02Document,
): AtlaspecV01Document {
  if (document.layers.length !== 1) {
    throw new AtlaspecMigrationError(
      'Atlaspec 0.2 can be downgraded only when it contains exactly one layer.',
    );
  }

  const layer = document.layers[0]!;
  if (layer.purpose !== 'primary') {
    throw new AtlaspecMigrationError(
      'Atlaspec 0.2 can be downgraded only when its sole layer is primary.',
    );
  }
  if ((document.constraints?.protected_layers?.length ?? 0) > 0) {
    throw new AtlaspecMigrationError(
      'Atlaspec 0.2 protected layer IDs have no lossless Atlaspec 0.1 representation.',
    );
  }
  if (document.constraints?.allow_duplicate_labels === true) {
    throw new AtlaspecMigrationError(
      'Atlaspec 0.2 duplicate-label permission has no Atlaspec 0.1 representation.',
    );
  }

  const { layers: _layers, constraints, ...shared } = document;
  const mergedConstraints = compact({
    colorblind_safe: constraints?.colorblind_safe,
    missing_data: layer.constraints?.missing_data,
    raw_count_choropleth: layer.constraints?.raw_count_choropleth,
    label_priority: constraints?.label_priority,
    viewport: constraints?.viewport,
  });

  return {
    ...structuredClone(shared),
    version: '0.1',
    family: layer.family,
    encoding: structuredClone(layer.encoding),
    ...(Object.keys(mergedConstraints).length === 0
      ? {}
      : { constraints: structuredClone(mergedConstraints) }),
    ...(layer.behavior === undefined
      ? {}
      : { behavior: structuredClone(layer.behavior) }),
  };
}

function compact<T extends Record<string, unknown>>(
  value: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  ) as { [K in keyof T]?: Exclude<T[K], undefined> };
}
