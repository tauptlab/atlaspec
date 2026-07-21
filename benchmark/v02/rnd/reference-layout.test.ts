import { describe, expect, it } from 'vitest';

import {
  buildReferenceLayoutSchedule,
  type ReferenceLayoutArm,
} from './reference-layout.js';

const arms: ReferenceLayoutArm[] = ['a', 'b', 'c', 'd'].map((id) => ({
  id,
  reference_path_from_manifest: `../references/${id}.md`,
  prompt_layout: id === 'd' ? 'reference-task-data' : 'task-data-reference',
}));

describe('reference-layout R&D schedule', () => {
  it('counterbalances every arm across every ordinal position', () => {
    const schedule = buildReferenceLayoutSchedule(
      ['task-1', 'task-2', 'task-3', 'task-4'],
      arms,
      1,
    );

    expect(schedule).toHaveLength(16);
    for (const arm of arms) {
      expect(
        schedule.filter((cell) => cell.arm.id === arm.id).map((cell) => cell.position),
      ).toEqual(expect.arrayContaining([1, 2, 3, 4]));
    }
    expect(new Set(schedule.map((cell) => `${cell.task_id}/${cell.arm.id}`)).size).toBe(16);
  });

  it('rejects ambiguous arm identifiers', () => {
    expect(() =>
      buildReferenceLayoutSchedule(
        ['task'],
        [arms[0]!, { ...arms[0]! }],
        1,
      ),
    ).toThrow('Duplicate reference-layout arm ID');
  });
});
