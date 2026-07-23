import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DEMO_BUILDINGS,
  ROUTE_GRAPH,
  cctvCoverage,
  findRoute,
  shadowPolygons,
  solarPosition,
} from './engine.js';

test('computes a plausible winter-solstice solar position for Seoul', () => {
  const sun = solarPosition({
    latitude: 37.5665,
    longitude: 126.978,
    timezone: 9,
    dayOfYear: 355,
    hour: 12.5,
  });

  assert.ok(sun.elevation > 25 && sun.elevation < 32);
  assert.ok(sun.azimuth > 175 && sun.azimuth < 195);
});

test('projects deterministic 2.5D shadow polygons beyond each footprint', () => {
  const sun = solarPosition({
    latitude: 37.5665,
    longitude: 126.978,
    timezone: 9,
    dayOfYear: 355,
    hour: 15,
  });
  const first = shadowPolygons(DEMO_BUILDINGS, sun);
  const second = shadowPolygons(DEMO_BUILDINGS, sun);

  assert.deepEqual(first, second);
  assert.equal(first.length, DEMO_BUILDINGS.length);
  assert.ok(first.every((shadow) => shadow.points.length >= 4));
  assert.ok(first.every((shadow) => shadow.lengthM > 0));
});

test('increasing CCTV field of view does not reduce sampled coverage', () => {
  const scene = {
    width: 640,
    height: 400,
    camera: { x: 82, y: 334 },
    obstacles: DEMO_BUILDINGS,
  };
  const narrow = cctvCoverage(scene, {
    headingDeg: 320,
    fieldOfViewDeg: 45,
    range: 440,
  });
  const wide = cctvCoverage(scene, {
    headingDeg: 320,
    fieldOfViewDeg: 100,
    range: 440,
  });

  assert.ok(wide.coverageRatio >= narrow.coverageRatio);
  assert.deepEqual(
    cctvCoverage(scene, {
      headingDeg: 320,
      fieldOfViewDeg: 100,
      range: 440,
    }),
    wide,
  );
});

test('routing changes deterministically when accessibility is required', () => {
  const fastest = findRoute(ROUTE_GRAPH, 'gate', 'clinic', 'fastest');
  const wheelchair = findRoute(
    ROUTE_GRAPH,
    'gate',
    'clinic',
    'wheelchair',
  );
  const lowRisk = findRoute(ROUTE_GRAPH, 'gate', 'clinic', 'low-risk');

  assert.deepEqual(fastest.path, ['gate', 'plaza', 'stairs', 'clinic']);
  assert.deepEqual(wheelchair.path, ['gate', 'ramp', 'clinic']);
  assert.deepEqual(lowRisk.path, ['gate', 'ramp', 'clinic']);
  assert.ok(fastest.distance < wheelchair.distance);
  assert.ok(wheelchair.edges.every((edge) => edge.accessible));
});

test('ships an English-only interface with versioned browser assets', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  const engine = readFileSync(new URL('./engine.js', import.meta.url), 'utf8');

  for (const [name, source] of [
    ['index.html', html],
    ['app.js', app],
    ['engine.js', engine],
  ]) {
    assert.doesNotMatch(source, /\p{Script=Hangul}/u, `${name} contains Hangul`);
  }

  assert.match(html, /styles\.css\?v=0\.2-en\.1/);
  assert.match(html, /app\.js\?v=0\.2-en\.1/);
  assert.match(app, /engine\.js\?v=0\.2-en\.1/);
  assert.match(app, /evidence\.json\?v=0\.2-en\.1/);
});
