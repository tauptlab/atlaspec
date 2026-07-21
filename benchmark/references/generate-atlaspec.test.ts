import { describe, expect, it } from 'vitest';

import {
  renderAtlaspecReference,
  renderAtlaspecV02Reference,
} from './generate-atlaspec.js';

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

  it('derives the ordered multi-layer 0.2 grammar separately from 0.1', () => {
    const reference = renderAtlaspecV02Reference();
    expect(reference).toContain('# Atlaspec 0.2 generation reference');
    expect(reference).toContain('ordered `layers` array');
    expect(reference).toContain('purpose: `primary`, `supporting`, `reference`');
    expect(reference).toContain('Put `missing_data` and `raw_count_choropleth` on');
    expect(reference).toContain(
      'task: `locate`, `compare`, `rank`, `distribution`, `distinguish`',
    );
    expect(reference).toContain(
      'audience: `general-public`, `analyst`, `expert`, `operations`, `student`',
    );
    expect(reference).toContain(
      'color classification: `continuous`, `equal-interval`, `quantile`, `natural-breaks`',
    );
    expect(reference).toContain('Do not put arrays');
    expect(reference).toContain('do not copy them into metadata');
    expect(reference).toContain('Do not invent zoom rules.');
    expect(reference).toContain('layer-visibility stress label alone');
    expect(reference).toContain('version: "0.2"');
  });
});
