import {
  DEMO_BUILDINGS,
  ROUTE_GRAPH,
  cctvCoverage,
  findRoute,
  shadowPolygons,
  solarPosition,
} from './engine.js';

const canvas = document.querySelector('#lab-canvas');
const context = canvas.getContext('2d');
const tabs = [...document.querySelectorAll('[data-scenario]')];
const panels = [...document.querySelectorAll('[data-panel]')];
const specOutput = document.querySelector('#spec-output');
const benchmarkButton = document.querySelector('#benchmark-button');
const benchmarkResult = document.querySelector('#benchmark-result');
const canvasStatus = document.querySelector('#canvas-status');
const canvasLegend = document.querySelector('#canvas-legend');
const metricA = document.querySelector('#metric-a');
const metricB = document.querySelector('#metric-b');
const metricRuntime = document.querySelector('#metric-runtime');
const metricALabel = document.querySelector('#metric-a-label');
const metricBLabel = document.querySelector('#metric-b-label');

const controls = {
  shadowTime: document.querySelector('#shadow-time'),
  shadowTimeOutput: document.querySelector('#shadow-time-output'),
  cctvHeading: document.querySelector('#cctv-heading'),
  cctvHeadingOutput: document.querySelector('#cctv-heading-output'),
  cctvFov: document.querySelector('#cctv-fov'),
  cctvFovOutput: document.querySelector('#cctv-fov-output'),
  cctvRange: document.querySelector('#cctv-range'),
  cctvRangeOutput: document.querySelector('#cctv-range-output'),
  routeMode: document.querySelector('#route-mode'),
};

const colors = {
  paper: '#faf8f2',
  ink: '#142033',
  grid: 'rgba(20, 32, 51, 0.09)',
  teal: '#0f766e',
  tealLight: 'rgba(15, 118, 110, 0.2)',
  orange: '#db643f',
  orangeLight: 'rgba(219, 100, 63, 0.34)',
  blue: '#315d8a',
  acid: '#d7eb59',
  muted: '#9ca4aa',
};

let activeScenario = 'shadow';
let lastComputation;

await loadEvidence();
bindInteractions();
render();

async function loadEvidence() {
  try {
    const response = await fetch('./data/evidence.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const evidence = await response.json();
    const locked = evidence.locked_development;
    setEvidenceText(
      'atlaspec-rate',
      `${formatPercent(locked.atlaspec.rate)}%`,
    );
    setEvidenceText(
      'atlaspec-fraction',
      `${locked.atlaspec.passed} / ${locked.atlaspec.assigned} healthy renders`,
    );
    setEvidenceText('direct-rate', `${formatPercent(locked.direct.rate)}%`);
    setEvidenceText(
      'direct-fraction',
      `${locked.direct.passed} / ${locked.direct.assigned} healthy renders`,
    );
    const difference = document.querySelector('[data-evidence="difference"]');
    difference.innerHTML = `+${locked.difference_percentage_points.toFixed(2)}<span>pp</span>`;
  } catch {
    canvasStatus.textContent = 'solver ready · evidence snapshot unavailable';
  }
}

function bindInteractions() {
  for (const tab of tabs) {
    tab.addEventListener('click', () => setScenario(tab.dataset.scenario));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const index = tabs.indexOf(tab);
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(index + direction + tabs.length) % tabs.length];
      setScenario(next.dataset.scenario);
      next.focus();
    });
  }

  for (const input of [
    controls.shadowTime,
    controls.cctvHeading,
    controls.cctvFov,
    controls.cctvRange,
    controls.routeMode,
  ]) {
    input.addEventListener('input', () => {
      benchmarkResult.textContent = 'Input changed. Run the benchmark again.';
      render();
    });
  }

  benchmarkButton.addEventListener('click', runBenchmark);
  document.querySelector('#copy-spec').addEventListener('click', copySpec);
}

function setScenario(scenario) {
  activeScenario = scenario;
  for (const tab of tabs) {
    const active = tab.dataset.scenario === scenario;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  for (const panel of panels) {
    panel.hidden = panel.dataset.panel !== scenario;
  }
  benchmarkResult.textContent = 'Not run yet.';
  render();
}

function render() {
  const started = performance.now();
  drawBase();

  if (activeScenario === 'shadow') {
    lastComputation = renderShadow();
  } else if (activeScenario === 'cctv') {
    lastComputation = renderCctv();
  } else {
    lastComputation = renderRoute();
  }

  const duration = performance.now() - started;
  metricRuntime.textContent =
    duration < 0.1 ? '<0.1ms' : `${duration.toFixed(2)}ms`;
  canvasStatus.textContent = `${activeScenario} solver · deterministic`;
}

function renderShadow() {
  const hour = Number(controls.shadowTime.value);
  const sun = solarPosition({
    latitude: 37.5665,
    longitude: 126.978,
    timezone: 9,
    dayOfYear: 355,
    hour,
  });
  const shadows = shadowPolygons(DEMO_BUILDINGS, sun);

  for (const shadow of shadows) {
    drawPolygon(shadow.points, colors.orangeLight, colors.orange);
  }
  for (const building of DEMO_BUILDINGS) {
    drawBuilding(building);
  }
  drawSun(sun);

  const longest = Math.max(...shadows.map((shadow) => shadow.lengthM));
  controls.shadowTimeOutput.textContent = formatHour(hour);
  metricALabel.textContent = 'Solar elevation';
  metricA.textContent = `${sun.elevation.toFixed(1)}°`;
  metricBLabel.textContent = 'Longest shadow';
  metricB.textContent = `${longest.toFixed(1)}m`;
  canvasLegend.innerHTML = legend([
    ['Building footprint', colors.ink],
    ['Projected shadow', colors.orange],
    ['Sun direction', colors.acid],
  ]);
  specOutput.textContent = shadowSpec(hour, sun);

  return { hour, sun, shadows, checksum: checksum(shadows) };
}

function renderCctv() {
  const headingDeg = Number(controls.cctvHeading.value);
  const fieldOfViewDeg = Number(controls.cctvFov.value);
  const range = Number(controls.cctvRange.value);
  const scene = {
    width: 640,
    height: 400,
    camera: { x: 82, y: 334 },
    obstacles: DEMO_BUILDINGS,
  };
  const coverage = cctvCoverage(scene, {
    headingDeg,
    fieldOfViewDeg,
    range,
    sampleStep: 8,
  });

  for (const point of coverage.points) {
    if (!point.covered) continue;
    context.fillStyle = colors.tealLight;
    context.fillRect(point.x - 4, point.y - 4, 8, 8);
  }
  drawCameraWedge(scene.camera, headingDeg, fieldOfViewDeg, range);
  for (const building of DEMO_BUILDINGS) {
    drawBuilding(building);
  }
  drawCamera(scene.camera, headingDeg);

  controls.cctvHeadingOutput.textContent = `${headingDeg}°`;
  controls.cctvFovOutput.textContent = `${fieldOfViewDeg}°`;
  controls.cctvRangeOutput.textContent = `${range}px`;
  metricALabel.textContent = 'Visible coverage';
  metricA.textContent = `${(coverage.coverageRatio * 100).toFixed(1)}%`;
  metricBLabel.textContent = 'Blind-spot ratio';
  metricB.textContent = `${((1 - coverage.coverageRatio) * 100).toFixed(1)}%`;
  canvasLegend.innerHTML = legend([
    ['Visible cells', colors.teal],
    ['Occluding building', colors.ink],
    ['Camera + FOV', colors.orange],
  ]);
  specOutput.textContent = cctvSpec(headingDeg, fieldOfViewDeg, range);

  return {
    scene,
    headingDeg,
    fieldOfViewDeg,
    range,
    coverage,
    checksum: checksum({
      visible: coverage.visible,
      total: coverage.total,
      ratio: coverage.coverageRatio,
    }),
  };
}

function renderRoute() {
  const mode = controls.routeMode.value;
  const route = findRoute(ROUTE_GRAPH, 'gate', 'clinic', mode);
  drawRouteGraph(ROUTE_GRAPH, route);

  metricALabel.textContent = 'Route distance';
  metricA.textContent = `${route.distance.toFixed(1)}u`;
  metricBLabel.textContent = 'Accumulated risk';
  metricB.textContent = route.risk.toFixed(2);
  canvasLegend.innerHTML = legend([
    ['Selected route', colors.teal],
    ['Traversable edge', colors.muted],
    ['Stair segment', colors.orange],
  ]);
  specOutput.textContent = routeSpec(mode, route);

  return { mode, route, checksum: checksum(route.path) };
}

function runBenchmark() {
  benchmarkButton.disabled = true;
  benchmarkResult.textContent = 'Running repeated calculations…';

  requestAnimationFrame(() => {
    const iterations = activeScenario === 'cctv' ? 120 : 1500;
    const started = performance.now();
    let digest = 0;
    for (let index = 0; index < iterations; index += 1) {
      digest = benchmarkIteration(activeScenario, index);
    }
    const duration = performance.now() - started;
    benchmarkResult.textContent =
      `${iterations.toLocaleString('en-US')} runs · ${duration.toFixed(1)}ms · ` +
      `${(duration / iterations).toFixed(4)}ms/run · checksum ${digest}`;
    benchmarkButton.disabled = false;
  });
}

function benchmarkIteration(scenario, index) {
  if (scenario === 'shadow') {
    const sun = solarPosition({
      latitude: 37.5665,
      longitude: 126.978,
      timezone: 9,
      dayOfYear: 355,
      hour: Number(controls.shadowTime.value),
    });
    return checksum(shadowPolygons(DEMO_BUILDINGS, sun));
  }
  if (scenario === 'cctv') {
    const result = cctvCoverage(
      {
        width: 640,
        height: 400,
        camera: { x: 82, y: 334 },
        obstacles: DEMO_BUILDINGS,
      },
      {
        headingDeg: Number(controls.cctvHeading.value),
        fieldOfViewDeg: Number(controls.cctvFov.value),
        range: Number(controls.cctvRange.value),
        sampleStep: 8,
      },
    );
    return checksum([result.visible, result.total]);
  }
  const result = findRoute(
    ROUTE_GRAPH,
    'gate',
    'clinic',
    controls.routeMode.value,
  );
  return checksum([result.path, index > -1]);
}

async function copySpec() {
  const button = document.querySelector('#copy-spec');
  try {
    await navigator.clipboard.writeText(specOutput.textContent);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Select to copy';
  }
  setTimeout(() => {
    button.textContent = 'Copy';
  }, 1400);
}

function drawBase() {
  context.clearRect(0, 0, 640, 400);
  context.fillStyle = colors.paper;
  context.fillRect(0, 0, 640, 400);
  context.strokeStyle = colors.grid;
  context.lineWidth = 1;
  for (let x = 0; x <= 640; x += 32) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, 400);
    context.stroke();
  }
  for (let y = 0; y <= 400; y += 32) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(640, y);
    context.stroke();
  }
  context.strokeStyle = 'rgba(20, 32, 51, 0.34)';
  context.setLineDash([7, 7]);
  context.strokeRect(18, 18, 604, 364);
  context.setLineDash([]);
}

function drawBuilding(building) {
  context.fillStyle = colors.ink;
  context.fillRect(building.x, building.y, building.width, building.height);
  context.strokeStyle = colors.paper;
  context.lineWidth = 3;
  context.strokeRect(
    building.x + 1.5,
    building.y + 1.5,
    building.width - 3,
    building.height - 3,
  );
  context.fillStyle = colors.acid;
  context.font = '700 10px ui-monospace, monospace';
  context.fillText(
    `${building.heightM}m`,
    building.x + 8,
    building.y + 17,
  );
}

function drawPolygon(points, fill, stroke) {
  if (points.length === 0) return;
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) context.lineTo(x, y);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = stroke;
  context.lineWidth = 1.2;
  context.stroke();
}

function drawSun(sun) {
  const azimuthRad = sun.azimuth * (Math.PI / 180);
  const x = 320 + Math.sin(azimuthRad) * 250;
  const y = 200 - Math.cos(azimuthRad) * 155;
  context.strokeStyle = colors.acid;
  context.lineWidth = 2;
  context.setLineDash([4, 5]);
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(320, 200);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = colors.acid;
  context.strokeStyle = colors.ink;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x, y, 10, 0, Math.PI * 2);
  context.fill();
  context.stroke();
}

function drawCameraWedge(camera, headingDeg, fieldOfViewDeg, range) {
  const start = (headingDeg - fieldOfViewDeg / 2) * (Math.PI / 180);
  const end = (headingDeg + fieldOfViewDeg / 2) * (Math.PI / 180);
  context.beginPath();
  context.moveTo(camera.x, camera.y);
  context.arc(camera.x, camera.y, range, start, end);
  context.closePath();
  context.fillStyle = 'rgba(219, 100, 63, 0.08)';
  context.fill();
  context.strokeStyle = colors.orange;
  context.lineWidth = 1.5;
  context.setLineDash([5, 5]);
  context.stroke();
  context.setLineDash([]);
}

function drawCamera(camera, headingDeg) {
  const heading = headingDeg * (Math.PI / 180);
  context.save();
  context.translate(camera.x, camera.y);
  context.rotate(heading);
  context.fillStyle = colors.orange;
  context.strokeStyle = colors.ink;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(17, 0);
  context.lineTo(-10, -10);
  context.lineTo(-10, 10);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}

function drawRouteGraph(graph, route) {
  for (const edge of graph.edges) {
    const from = graph.nodes[edge.from];
    const to = graph.nodes[edge.to];
    const selected = route.edges.includes(edge);
    context.strokeStyle = selected
      ? colors.teal
      : edge.accessible
        ? colors.muted
        : colors.orange;
    context.lineWidth = selected ? 7 : 3;
    context.setLineDash(edge.accessible ? [] : [7, 6]);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
  context.setLineDash([]);

  for (const [id, node] of Object.entries(graph.nodes)) {
    const selected = route.path.includes(id);
    context.fillStyle = selected ? colors.acid : colors.paper;
    context.strokeStyle = colors.ink;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(node.x, node.y, selected ? 12 : 9, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = colors.ink;
    context.font = '700 12px system-ui, sans-serif';
    context.fillText(node.label, node.x + 15, node.y + 4);
  }
}

function shadowSpec(hour, sun) {
  return `version: "0.1"
analysis: solar-shadow
at: 2026-12-21T${formatHour(hour)}:00+09:00
crs: EPSG:5179

objects:
  source: buildings.geojson
  footprint: geometry
  height: height_m

terrain:
  mode: flat

solver:
  sun_elevation_deg: ${sun.elevation.toFixed(2)}
  sun_azimuth_deg: ${sun.azimuth.toFixed(2)}

outputs:
  - shadow_polygons
  - maximum_shadow_length`;
}

function cctvSpec(heading, fov, range) {
  return `version: "0.1"
analysis: camera-coverage
crs: EPSG:5179

camera:
  position: [82, 334]
  height_m: 4.5
  heading_deg: ${heading}
  horizontal_fov_deg: ${fov}
  maximum_range_px: ${range}

obstacles:
  source: buildings.geojson
  footprint: geometry
  height: height_m

outputs:
  - coverage_cells
  - blind_spot_ratio

assumptions:
  terrain: flat
  vegetation: ignored`;
}

function routeSpec(mode, route) {
  return `version: "0.1"
analysis: constrained-route
network: campus-graph.json

origin: gate
destination: clinic
objective: ${mode}

constraints:
  wheelchair_accessible: ${mode === 'wheelchair'}
  apply_risk_cost: ${mode === 'low-risk'}

result:
  path: [${route.path.join(', ')}]
  distance_units: ${route.distance.toFixed(1)}
  accumulated_risk: ${route.risk.toFixed(2)}

outputs:
  - route_edges
  - decision_trace`;
}

function formatHour(value) {
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatPercent(value) {
  return (value * 100).toFixed(2);
}

function setEvidenceText(key, value) {
  const element = document.querySelector(`[data-evidence="${key}"]`);
  if (element) element.textContent = value;
}

function legend(entries) {
  return entries
    .map(
      ([label, color]) =>
        `<span class="legend-item"><i class="legend-swatch" style="--swatch:${color}"></i>${label}</span>`,
    )
    .join('');
}

function checksum(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
