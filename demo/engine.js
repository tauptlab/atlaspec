const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export const DEMO_BUILDINGS = [
  { id: 'civic-hall', x: 248, y: 176, width: 82, height: 58, heightM: 31 },
  { id: 'library', x: 382, y: 92, width: 96, height: 68, heightM: 22 },
  { id: 'market', x: 420, y: 246, width: 108, height: 72, heightM: 16 },
];

export const ROUTE_GRAPH = {
  nodes: {
    gate: { x: 82, y: 326, label: '정문' },
    plaza: { x: 190, y: 224, label: '광장' },
    stairs: { x: 306, y: 132, label: '계단' },
    clinic: { x: 520, y: 82, label: '의무실' },
    ramp: { x: 492, y: 316, label: '경사로' },
  },
  edges: [
    { from: 'gate', to: 'plaza', distance: 1.8, risk: 0.6, accessible: true },
    { from: 'plaza', to: 'stairs', distance: 1.1, risk: 1.4, accessible: false },
    { from: 'stairs', to: 'clinic', distance: 1.8, risk: 1.1, accessible: false },
    { from: 'gate', to: 'ramp', distance: 3, risk: 0.15, accessible: true },
    { from: 'ramp', to: 'clinic', distance: 2.2, risk: 0.2, accessible: true },
    { from: 'plaza', to: 'ramp', distance: 2.8, risk: 0.9, accessible: true },
  ],
};

export function solarPosition({
  latitude,
  longitude,
  timezone,
  dayOfYear,
  hour,
}) {
  const gamma =
    ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hour - 12) / 24);
  const equationOfTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const declination =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const timeOffset = equationOfTime + 4 * longitude - 60 * timezone;
  const trueSolarMinutes = hour * 60 + timeOffset;
  const hourAngle = (trueSolarMinutes / 4 - 180) * DEG_TO_RAD;
  const latitudeRad = latitude * DEG_TO_RAD;
  const cosZenith = clamp(
    Math.sin(latitudeRad) * Math.sin(declination) +
      Math.cos(latitudeRad) * Math.cos(declination) * Math.cos(hourAngle),
    -1,
    1,
  );
  const zenith = Math.acos(cosZenith);
  const elevation = 90 - zenith * RAD_TO_DEG;
  const azimuthRad = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(latitudeRad) -
      Math.tan(declination) * Math.cos(latitudeRad),
  );
  const azimuth = (azimuthRad * RAD_TO_DEG + 180 + 360) % 360;

  return {
    elevation,
    azimuth,
    equationOfTime,
  };
}

export function shadowPolygons(
  buildings,
  sun,
  { pixelsPerMeter = 2.35, maximumLength = 260 } = {},
) {
  if (sun.elevation <= 0) {
    return buildings.map((building) => ({
      id: building.id,
      points: rectanglePoints(building),
      lengthM: Number.POSITIVE_INFINITY,
    }));
  }

  return buildings.map((building) => {
    const lengthM = building.heightM / Math.tan(sun.elevation * DEG_TO_RAD);
    const screenLength = Math.min(maximumLength, lengthM * pixelsPerMeter);
    const azimuthRad = sun.azimuth * DEG_TO_RAD;
    const dx = -Math.sin(azimuthRad) * screenLength;
    const dy = Math.cos(azimuthRad) * screenLength;
    const footprint = rectanglePoints(building);
    const projected = footprint.map(([x, y]) => [x + dx, y + dy]);

    return {
      id: building.id,
      points: convexHull([...footprint, ...projected]),
      lengthM,
    };
  });
}

export function cctvCoverage(
  {
    width,
    height,
    camera,
    obstacles,
  },
  {
    headingDeg,
    fieldOfViewDeg,
    range,
    sampleStep = 8,
  },
) {
  const points = [];
  let visible = 0;

  for (let y = sampleStep / 2; y < height; y += sampleStep) {
    for (let x = sampleStep / 2; x < width; x += sampleStep) {
      const dx = x - camera.x;
      const dy = y - camera.y;
      const distance = Math.hypot(dx, dy);
      const bearing = normalizeDegrees(Math.atan2(dy, dx) * RAD_TO_DEG);
      const inView =
        distance <= range &&
        Math.abs(angleDifference(bearing, headingDeg)) <= fieldOfViewDeg / 2;
      const blocked =
        inView &&
        obstacles.some((obstacle) =>
          segmentIntersectsRectangle(
            camera.x,
            camera.y,
            x,
            y,
            obstacle,
          ),
        );
      const covered = inView && !blocked;
      if (covered) visible += 1;
      points.push({ x, y, covered });
    }
  }

  return {
    points,
    visible,
    total: points.length,
    coverageRatio: visible / points.length,
  };
}

export function findRoute(
  graph,
  start,
  end,
  mode = 'fastest',
) {
  const distances = new Map(
    Object.keys(graph.nodes).map((id) => [id, Number.POSITIVE_INFINITY]),
  );
  const previous = new Map();
  const unvisited = new Set(Object.keys(graph.nodes));
  distances.set(start, 0);

  while (unvisited.size > 0) {
    const current = [...unvisited].reduce((best, candidate) =>
      distances.get(candidate) < distances.get(best) ? candidate : best,
    );
    if (!Number.isFinite(distances.get(current))) break;
    unvisited.delete(current);
    if (current === end) break;

    for (const edge of adjacentEdges(graph.edges, current)) {
      if (mode === 'wheelchair' && !edge.accessible) continue;
      const neighbor = edge.from === current ? edge.to : edge.from;
      if (!unvisited.has(neighbor)) continue;
      const candidate = distances.get(current) + edgeCost(edge, mode);
      if (candidate < distances.get(neighbor)) {
        distances.set(neighbor, candidate);
        previous.set(neighbor, { node: current, edge });
      }
    }
  }

  if (!Number.isFinite(distances.get(end))) {
    return { found: false, path: [], edges: [], cost: Number.POSITIVE_INFINITY };
  }

  const path = [end];
  const edges = [];
  let current = end;
  while (current !== start) {
    const step = previous.get(current);
    if (step === undefined) break;
    edges.unshift(step.edge);
    current = step.node;
    path.unshift(current);
  }

  return {
    found: path[0] === start,
    path,
    edges,
    cost: distances.get(end),
    distance: edges.reduce((sum, edge) => sum + edge.distance, 0),
    risk: edges.reduce((sum, edge) => sum + edge.risk, 0),
  };
}

export function convexHull(points) {
  const sorted = [...points].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1],
  );
  if (sorted.length <= 1) return sorted;
  const lower = [];
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower.at(-2), lower.at(-1), point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper = [];
  for (const point of [...sorted].reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper.at(-2), upper.at(-1), point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function edgeCost(edge, mode) {
  if (mode === 'low-risk') return edge.distance + edge.risk * 1.8;
  if (mode === 'wheelchair') return edge.distance + edge.risk * 0.35;
  return edge.distance;
}

function adjacentEdges(edges, node) {
  return edges.filter((edge) => edge.from === node || edge.to === node);
}

function rectanglePoints({ x, y, width, height }) {
  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
}

function cross(origin, a, b) {
  return (
    (a[0] - origin[0]) * (b[1] - origin[1]) -
    (a[1] - origin[1]) * (b[0] - origin[0])
  );
}

function segmentIntersectsRectangle(x1, y1, x2, y2, rectangle) {
  const { x, y, width, height } = rectangle;
  if (
    x2 >= x &&
    x2 <= x + width &&
    y2 >= y &&
    y2 <= y + height
  ) {
    return true;
  }
  const edges = [
    [x, y, x + width, y],
    [x + width, y, x + width, y + height],
    [x + width, y + height, x, y + height],
    [x, y + height, x, y],
  ];
  return edges.some(([x3, y3, x4, y4]) =>
    segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4),
  );
}

function segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denominator) < 1e-9) return false;
  const t =
    ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) /
    denominator;
  const u =
    -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) /
    denominator;
  return t > 1e-7 && t < 1 - 1e-7 && u > 1e-7 && u < 1 - 1e-7;
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function angleDifference(a, b) {
  return ((a - b + 540) % 360) - 180;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
