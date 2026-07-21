import type { GenerationRequest } from '../../protocol.js';

export interface ReferenceLayoutArm {
  id: string;
  reference_path_from_manifest: string;
  prompt_layout: NonNullable<GenerationRequest['prompt_layout']>;
}

export interface ReferenceLayoutCell {
  task_id: string;
  repetition: number;
  arm: ReferenceLayoutArm;
  position: number;
}

export function buildReferenceLayoutSchedule(
  taskIds: readonly string[],
  arms: readonly ReferenceLayoutArm[],
  repetitions: number,
): ReferenceLayoutCell[] {
  if (taskIds.length === 0) throw new Error('At least one task is required.');
  if (arms.length < 2) throw new Error('At least two reference-layout arms are required.');
  if (!Number.isInteger(repetitions) || repetitions < 1) {
    throw new Error('Repetitions must be a positive integer.');
  }
  const ids = new Set<string>();
  for (const arm of arms) {
    if (!/^[a-z0-9-]+$/.test(arm.id)) {
      throw new Error(`Invalid reference-layout arm ID: ${arm.id}`);
    }
    if (ids.has(arm.id)) throw new Error(`Duplicate reference-layout arm ID: ${arm.id}`);
    ids.add(arm.id);
  }

  const cells: ReferenceLayoutCell[] = [];
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    taskIds.forEach((taskId, taskIndex) => {
      const offset = (taskIndex + repetition - 1) % arms.length;
      for (let position = 0; position < arms.length; position += 1) {
        cells.push({
          task_id: taskId,
          repetition,
          arm: arms[(position + offset) % arms.length]!,
          position: position + 1,
        });
      }
    });
  }
  return cells;
}
