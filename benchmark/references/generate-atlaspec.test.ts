import { describe, expect, it } from 'vitest';

import { renderAtlaspecReference } from './generate-atlaspec.js';

describe('schema-derived Atlaspec generation reference', () => {
  it('exposes exhaustive enums and forbids observed invented keys', () => {
    const reference = renderAtlaspecReference();
    expect(reference).toContain(
      '`choropleth`, `proportional-symbol`, `categorical-point`, `heatmap`',
    );
    expect(reference).toContain('`locate`, `compare`, `rank`, `distribution`, `distinguish`');
    expect(reference).toContain('`general-public`, `analyst`, `expert`, `operations`, `student`');
    expect(reference).toContain('support: `point`, `line`, `polygon`, `grid`');
    expect(reference).toContain('size, category, label, and weight objects: `field` only');
    expect(reference).toContain('`behavior.zoom_rules`');
    expect(reference).toContain('ordinal or quantitative');
    expect(reference).toContain('label_priority: array of strings');
    expect(reference).toContain('never a string or boolean');
    expect(reference).toContain('Do not put arrays or nested objects in metadata.');
  });
});
