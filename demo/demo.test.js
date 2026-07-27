import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, app, styles, data, packageJson] = await Promise.all([
  readFile(new URL('./index.html', import.meta.url), 'utf8'),
  readFile(new URL('./app.js', import.meta.url), 'utf8'),
  readFile(new URL('./styles.css', import.meta.url), 'utf8'),
  readFile(new URL('./data/compiler-examples.json', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
]);

test('ships a scope-aligned English compiler lab', () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /12 unique tasks/);
  assert.match(html, /V0\.2 HOLDOUT[\s\S]*Not run/);
  assert.match(html, /Stronger baseline/);
  assert.match(html, /An opinionated cartographic IR—not a general GIS/);
  assert.doesNotMatch(html, /Sealed v0\.2/);
  assert.doesNotMatch(html, /Solar shadow|CCTV coverage|Constrained route/);
  assert.doesNotMatch(app, /shadow|cctv|route/i);
});

test('uses cache-versioned browser assets', () => {
  assert.match(html, /styles\.css\?v=0\.2-scope\.1/);
  assert.match(html, /app\.js\?v=0\.2-scope\.1/);
  assert.match(app, /compiler-examples\.json\?v=0\.2-scope\.1/);
});

test('publishes a compiler-generated snapshot for the current package', () => {
  const snapshot = JSON.parse(data);
  const packageMetadata = JSON.parse(packageJson);
  assert.equal(snapshot.package_version, packageMetadata.version);
  assert.deepEqual(
    snapshot.examples.map(({ id, verdict }) => ({ id, verdict })),
    [
      { id: 'unsafe-count', verdict: 'rejected' },
      { id: 'flood-probability', verdict: 'compiled' },
      { id: 'shelter-capacity', verdict: 'compiled' },
    ],
  );
  assert.ok(
    snapshot.examples[0].diagnostics.some(
      ({ code }) => code === 'choropleth.raw-count',
    ),
  );
  assert.ok(
    snapshot.examples[2].decisions.some(
      ({ code }) => code === 'size.area-proportional-scale',
    ),
  );
});

test('keeps the interface readable rather than micro-typographic', () => {
  assert.match(styles, /body[\s\S]*font: 17px/);
  assert.match(styles, /\.hero-lede[\s\S]*clamp\(20px/);
  assert.match(styles, /\.section-heading h2[\s\S]*clamp\(42px/);
});
