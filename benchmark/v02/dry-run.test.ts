import { describe, expect, it } from 'vitest';

import { runV02DryRun } from './dry-run.js';

describe('AtlasBench 0.2 deterministic dry run', () => {
  it('accepts every locked reference condition without model calls', () => {
    expect(runV02DryRun()).toEqual({
      version: '0.2',
      status: 'deterministic-dry-run',
      tasks: 48,
      conditions: 214,
      accepted: 214,
      failed: [],
      model_calls: 0,
    });
  });
});
