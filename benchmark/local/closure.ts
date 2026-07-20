import { posix } from 'node:path';

import type { ExperimentManifest } from '../experiment.js';
import type { ModelIdentity } from '../protocol.js';
import {
  DIFFICULTIES,
  FAMILIES,
  VARIANTS,
  type CorpusMatrix,
} from '../corpus/corpus.js';
import { rebaseManifestPaths } from '../corpus/prepare.js';

export function closureTaskIds(matrix: CorpusMatrix): Set<string> {
  const ids = new Set<string>();
  for (const [familyIndex, family] of FAMILIES.entries()) {
    for (const [difficultyIndex, difficulty] of DIFFICULTIES.entries()) {
      const variant = VARIANTS[(familyIndex + difficultyIndex + 3) % VARIANTS.length]!;
      const task = matrix.tasks.find(
        (candidate) =>
          candidate.family === family &&
          candidate.difficulty === difficulty &&
          candidate.variant === variant,
      );
      if (task === undefined || task.split !== 'development') {
        throw new Error(
          `Closure task is not development-visible: ${family}/${difficulty}/${variant}.`,
        );
      }
      ids.add(task.id);
    }
  }
  return ids;
}

export function buildCodexClosureManifest(
  source: ExperimentManifest,
  matrix: CorpusMatrix,
  model: ModelIdentity,
  sourceDirectory: string,
  manifestDirectory: string,
): ExperimentManifest {
  const selectedIds = closureTaskIds(matrix);
  const tasks = source.tasks
    .filter((task) => selectedIds.has(task.id))
    .map((task) => ({
      ...structuredClone(task),
      conditions: task.conditions.filter(
        (condition) =>
          condition.condition === 'atlaspec' ||
          condition.condition === 'atlaspec-repair',
      ),
    }));
  if (tasks.length !== 12 || tasks.some((task) => task.conditions.length !== 2)) {
    throw new Error('Codex closure probe requires 12 tasks with two Atlaspec conditions each.');
  }
  return rebaseManifestPaths(
    {
      ...structuredClone(source),
      suite: 'atlasbench-local-codex-closure-v1',
      repetitions: 1,
      execution_order: 'balanced',
      model: structuredClone(model),
      tasks,
    },
    normalizePath(sourceDirectory),
    normalizePath(manifestDirectory),
  );
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', posix.sep);
}
