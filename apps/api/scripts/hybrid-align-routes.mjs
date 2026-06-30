#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OSRM = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';

const arg = (name, fallback = '') => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const has = (name) => process.argv.includes(name);
const resolvePath = (value) => {
  const clean = String(value || '').trim().replace(/^['"]|['"]$/g, '');
  return path.isAbsolute(clean) ? path.normalize(clean) : path.resolve(ROOT, clean);
};

const cfg = {
  input: resolvePath(arg('--input', 'rutastransporte')),
  output: resolvePath(arg('--output', 'apps/web/public/routes')),
  route: arg('--route', ''),
  limit: Number(arg('--limit', '0')),
  densify: Number(arg('--densify', '14')),
  radius: Number(arg('--radius', '60')),
  candidates: Number(arg('--candidates', '5')),
  anchorGap: Number(arg('--anchor-gap', '65')),
  turnAngle: Number(arg('--turn-angle', '20')),
};

const norm = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slug = (value) => norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ruta';
const pretty = (value) => String(value || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').replace(/^\d+\s*[-_. ]\s*/, '').trim();
const xml = (value) => String(value || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

const toRad = (value) => value * Math.PI / 180;
const toDeg = (value) => value * 180 / Math.PI;
function meters(a, b) {
  const h = Math.sin(toRad(b[1] - a[1]) / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(toRad(b[0] - a[0]) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function length(line) {
  return line.slice(1).reduce((sum, point, index) => sum + meters(line[index], point), 0);
}
function bearing(a, b) {
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLon = toRad(b[0] - a[0]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function bearingDelta(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
function dedupe(line) {
  const out = [];
  for (const point of line) {
    const last = out.at(-1);
    if (!last || Math.abs(last[0] - point[0]) > 1e-7 || Math.abs(last[1] - point[1]) > 1e-7) out.push(point);
  }
  return out;
}
function densify(line, step = cfg.densify) {
  const out = [];
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i];
    const b = line[i + 1];
    if (!out.length) out.push(a);
    const count = Math.max(1, Math.ceil(meters(a, b) / step));
    for (let j = 1; j <= count; j += 1) {
      const t = j / count;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return dedupe(out);
}

function projectFactory(points) {
  const lat0 = points.reduce((sum, point) => sum + point[1], 0) / Math.max(1, points.length);
  const mx = 111320 * Math.cos(toRad(lat0));
  return ([lon, lat]) => ({ x: lon * mx, y: lat * 110540 });
}
function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (!dx && !dy) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}
function distanceToLine(point, line, project) {
  const p = project(point);
  let best = Infinity;
  for (let i = 1; i < line.length; i += 1) {
    best = Math.min(best, pointSegmentDistance(p, project(line[i - 1]), project(line[i])));
  }
  return best;
}
function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}
function routeQuality(raw, candidate) {
  const rawLen = Math.max(1, length(raw));
  const candLen = length(candidate);
  const project = projectFactory(raw.concat(candidate));
  const rawSample = densify(raw, 18);
  const candSample = densify(candidate, 18);
  const rawToCand = rawSample.map((point) => distanceToLine(point, candidate, project));
  const candToRaw = candSample.map((point) => distanceToLine(point, raw, project));
  return {
    rawLen,
    candLen,
    ratio: candLen / rawLen,
    p95RawToCand: percentile(rawToCand, 0.95),
    p95CandToRaw: percentile(candToRaw, 0.95),
    maxRawToCand: Math.max(...rawToCand, 0),
    maxCandToRaw: Math.max(...candToRaw, 0),
  };
}
function acceptedRoute(q) {
  const short = q.rawLen < 35;
  const maxRatio = short ? 4.0 : 2.15;
  const maxExtra = short ? 95 : Math.max(140, q.rawLen * 1.4);
  return q.ratio >= 0.35 && q.ratio <= maxRatio && (q.candLen - q.rawLen) <= maxExtra && q.p95RawToCand <= 32 && q.p95CandToRaw <= 48 && q.maxCandToRaw <= 110;
}

async function collectFiles(target) {
  const out = [];
  async function visit(item) {
    const stat = await fs.stat(item).catch(() => null);
    if (!stat) return;
    if (stat.isFile()) {
      if (/\.(kml|geojson|json)$/i.test(item)) out.push(item);
      return;
    }
    const entries = await fs.readdir(item);
    for (const entry of entries) if (!entry.startsWith('.')) await visit(path.join(item, entry));
  }
  await visit(cfg.input);
  return out.sort();
}
function tag(block, name) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? xml(match[1].replace(/<[^>]+>/g, '').trim()) : '';
}
function routeNameFromFile(file) {
  const base = pretty(path.basename(file, path.extname(file)));
  const grandParent = pretty(path.basename(path.dirname(path.dirname(file))));
  if (/^(kml|mapa|shape|combi|autobus|microbus|microbuc)$/i.test(base)) return grandParent || base;
  return base || grandParent || 'Ruta';
}
function parseCoordinates(text) {
  return String(text).trim().split(/\s+/).map((item) => item.split(',').map(Number)).filter((item) => Number.isFinite(item[0]) && Number.isFinite(item[1])).map(([lon, lat]) => [lon, lat]);
}
function parseKml(text, file) {
  const out = [];
  const placemarks = text.match(/<Placemark[\s\S]*?<\/Placemark>/gi) || [text];
  for (const placemark of placemarks) {
    let name = pretty(tag(placemark, 'name') || routeNameFromFile(file));
    if (/^(combi|autobus|microbus|microbuc)$/i.test(name)) name = routeNameFromFile(file);
    for (const match of placemark.matchAll(/<coordinates[^>]*>([\s\S]*?)<\/coordinates>/gi)) {
      const line = dedupe(parseCoordinates(match[1]));
      if (line.length > 1) out.push({ file, name, line });
    }
  }
  return out;
}
function parseGeojson(text, file) {
  const json = JSON.parse(text);
  const features = json.type === 'FeatureCollection' ? json.features : [json];
  const out = [];
  for (const feature of features) {
    const geometry = feature.geometry || feature;
    const props = feature.properties || {};
    const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.type === 'MultiLineString' ? geometry.coordinates : [];
    for (const line of lines) {
      const clean = dedupe(line.map(([lon, lat]) => [Number(lon), Number(lat)]).filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat)));
      if (clean.length > 1) out.push({ file, name: pretty(props.routeName || props.name || routeNameFromFile(file)), line: clean });
    }
  }
  return out;
}

const nearestCache = new Map();
async function nearestCandidates(point) {
  const key = `${point[0].toFixed(5)},${point[1].toFixed(5)}`;
  if (nearestCache.has(key)) return nearestCache.get(key);
  const url = `${OSRM.replace(/\/$/, '')}/nearest/v1/driving/${point[0].toFixed(6)},${point[1].toFixed(6)}?number=${cfg.candidates}`;
  const response = await fetch(url, { headers: { 'user-agent': 'ViaMoreliaHybridAligner/1.0' } });
  if (!response.ok) return [{ xy: point, d: cfg.radius }];
  const data = await response.json();
  const candidates = (data.waypoints || [])
    .map((waypoint) => ({ xy: waypoint.location || point, d: waypoint.distance ?? cfg.radius }))
    .filter((candidate) => candidate.d <= cfg.radius);
  const result = candidates.length ? candidates : [{ xy: point, d: cfg.radius }];
  nearestCache.set(key, result);
  return result;
}
async function osrmRoute(a, b) {
  const url = `${OSRM.replace(/\/$/, '')}/route/v1/driving/${a[0].toFixed(6)},${a[1].toFixed(6)};${b[0].toFixed(6)},${b[1].toFixed(6)}?overview=full&geometries=geojson&steps=false&continue_straight=false`;
  const response = await fetch(url, { headers: { 'user-agent': 'ViaMoreliaHybridAligner/1.0' } });
  if (!response.ok) throw new Error(`route ${response.status}`);
  const data = await response.json();
  const coordinates = data.routes?.[0]?.geometry?.coordinates;
  if (!coordinates?.length) throw new Error(`route ${data.code || 'empty'}`);
  return dedupe(coordinates);
}

function makeAnchors(raw) {
  const points = densify(raw, cfg.densify);
  if (points.length <= 2) return points.map((point, index) => ({ point, index }));
  const anchors = [{ point: points[0], index: 0 }];
  let lastAnchor = 0;
  let lastBearing = bearing(points[0], points[1]);
  let distanceSince = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    distanceSince += meters(points[i - 1], points[i]);
    const b = bearing(points[i], points[i + 1]);
    const turn = bearingDelta(lastBearing, b);
    const enoughDistance = distanceSince >= cfg.anchorGap;
    const importantTurn = turn >= cfg.turnAngle && distanceSince >= 16;
    if (enoughDistance || importantTurn) {
      anchors.push({ point: points[i], index: i });
      lastAnchor = i;
      lastBearing = b;
      distanceSince = 0;
    }
  }
  if (lastAnchor !== points.length - 1) anchors.push({ point: points.at(-1), index: points.length - 1 });
  return anchors;
}
function transitionCost(rawPrev, rawNow, prev, now) {
  const rawDistance = Math.max(1, meters(rawPrev, rawNow));
  const snapDistance = meters(prev, now);
  let cost = Math.abs(snapDistance - rawDistance) * 1.7;
  if (snapDistance > Math.max(35, rawDistance * 3.0)) cost += 700;
  if (snapDistance < rawDistance * 0.12 && rawDistance > 8) cost += 60;
  return cost;
}
async function viterbiSnap(raw) {
  const points = densify(raw, Math.max(10, cfg.densify));
  const candidateSets = [];
  for (let i = 0; i < points.length; i += 1) candidateSets.push(await nearestCandidates(points[i]));
  const scores = [candidateSets[0].map((candidate) => candidate.d * 2)];
  const backs = [[]];
  for (let i = 1; i < candidateSets.length; i += 1) {
    const row = [];
    const back = [];
    for (const candidate of candidateSets[i]) {
      let best = Infinity;
      let bestIndex = 0;
      for (let j = 0; j < candidateSets[i - 1].length; j += 1) {
        const previous = candidateSets[i - 1][j];
        const cost = scores[i - 1][j] + candidate.d * 2 + transitionCost(points[i - 1], points[i], previous.xy, candidate.xy);
        if (cost < best) {
          best = cost;
          bestIndex = j;
        }
      }
      row.push(best);
      back.push(bestIndex);
    }
    scores.push(row);
    backs.push(back);
  }
  let index = scores.at(-1).reduce((best, value, i, arr) => (value < arr[best] ? i : best), 0);
  const line = [];
  for (let i = candidateSets.length - 1; i >= 0; i -= 1) {
    line.push(candidateSets[i][index].xy);
    index = backs[i][index] ?? 0;
  }
  return removeSpikes(dedupe(line.reverse()));
}
function angleAt(a, b, c) {
  return bearingDelta(bearing(b, a), bearing(b, c));
}
function removeSpikes(line) {
  if (line.length < 3) return line;
  let current = line;
  for (let pass = 0; pass < 2; pass += 1) {
    const out = [current[0]];
    for (let i = 1; i < current.length - 1; i += 1) {
      const a = out.at(-1);
      const b = current[i];
      const c = current[i + 1];
      const ab = meters(a, b);
      const bc = meters(b, c);
      const ac = meters(a, c);
      const angle = angleAt(a, b, c);
      if (angle < 32 && ac < 90) continue;
      if (angle > 135 && ac < 70 && ab + bc > ac * 2.1) continue;
      if (ab < 3 || bc < 3) continue;
      out.push(b);
    }
    out.push(current.at(-1));
    current = dedupe(out);
  }
  return current;
}
async function alignSegment(raw) {
  const startCandidates = await nearestCandidates(raw[0]);
  const endCandidates = await nearestCandidates(raw.at(-1));
  const options = [];
  for (const start of startCandidates.slice(0, 3)) {
    for (const end of endCandidates.slice(0, 3)) {
      try {
        const routed = await osrmRoute(start.xy, end.xy);
        const q = routeQuality(raw, routed);
        if (acceptedRoute(q)) options.push({ method: 'route', line: routed, quality: q, score: q.p95RawToCand + q.p95CandToRaw + Math.abs(1 - q.ratio) * 30 });
      } catch {
        // try next pair
      }
    }
  }
  if (options.length) return options.sort((a, b) => a.score - b.score)[0];
  const snapped = await viterbiSnap(raw);
  return { method: 'snap', line: snapped, quality: routeQuality(raw, snapped) };
}
async function hybridAlign(raw, label) {
  const dense = densify(raw, cfg.densify);
  const anchors = makeAnchors(raw);
  const output = [];
  const segments = [];
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const start = anchors[i].index;
    const end = Math.max(start + 1, anchors[i + 1].index);
    const rawSegment = dense.slice(start, end + 1);
    if (i % 10 === 0) console.log(`  ${label}: segmento ${i + 1}/${anchors.length - 1}`);
    const aligned = await alignSegment(rawSegment);
    output.push(...aligned.line);
    segments.push({ method: aligned.method, rawLengthM: Math.round(aligned.quality.rawLen), alignedLengthM: Math.round(aligned.quality.candLen), ratio: Number(aligned.quality.ratio.toFixed(3)) });
  }
  return { line: removeSpikes(dedupe(output)), segments };
}
function color(name) {
  const n = norm(name);
  if (n.includes('azul')) return ['#004E98', 'Azul', 'A'];
  if (n.includes('verde')) return ['#70A800', 'Verde', 'V'];
  if (n.includes('naranja')) return ['#FF5500', 'Naranja', 'N'];
  if (n.includes('guinda')) return ['#611240', 'Guinda', 'G'];
  if (n.includes('morad')) return ['#8238EA', 'Morada', 'M'];
  if (n.includes('cafe')) return ['#8B4513', 'Café', 'C'];
  return ['#FFC800', 'Amarillo', 'A'];
}
function groupRoutes(items) {
  const routes = new Map();
  const filter = norm(cfg.route);
  for (const item of items) {
    if (filter && !norm(`${item.name} ${item.file}`).includes(filter)) continue;
    const name = pretty(item.name).replace(/\s*(ida|vuelta|regreso|retorno)$/i, '').trim();
    const id = slug(name);
    if (!routes.has(id)) {
      const [lineColor, colorName, colorLetter] = color(name);
      routes.set(id, { id, name, color: lineColor, colorName, colorLetter, transportType: 'Combi', variants: [] });
    }
    const route = routes.get(id);
    const direction = /vuelta|regreso|retorno/.test(norm(item.name)) ? 'vuelta' : /ida|salida/.test(norm(item.name)) ? 'ida' : route.variants.length ? 'vuelta' : 'ida';
    route.variants.push({ direction, source: item.line, file: item.file });
  }
  return [...routes.values()].sort((a, b) => a.name.localeCompare(b.name, 'es-MX'));
}
function feature(route, variant, aligned) {
  return {
    type: 'Feature',
    properties: {
      routeId: route.id,
      routeName: route.name,
      direction: variant.direction,
      color: route.color,
      casingColor: '#222222',
      longKm: Number((length(aligned.line) / 1000).toFixed(4)),
      transportType: route.transportType,
      name: variant.direction === 'vuelta' ? 'Vuelta' : 'Ida',
      alignment: {
        method: 'hybrid-route-and-topology-snap',
        sourceLengthM: Math.round(length(variant.source)),
        alignedLengthM: Math.round(length(aligned.line)),
        lengthRatio: Number((length(aligned.line) / Math.max(1, length(variant.source))).toFixed(4)),
        segmentCount: aligned.segments.length,
      },
    },
    geometry: { type: 'LineString', coordinates: aligned.line },
  };
}
async function main() {
  const files = await collectFiles(cfg.input);
  if (!files.length) throw new Error(`No encontre KML/GeoJSON en ${cfg.input}`);
  if (has('--list-files')) {
    files.forEach((file) => console.log(`- ${file} -> ${routeNameFromFile(file)}`));
    return;
  }
  let items = [];
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    items.push(...(/\.kml$/i.test(file) ? parseKml(text, file) : parseGeojson(text, file)));
  }
  let routes = groupRoutes(items);
  if (has('--list-routes')) {
    routes.forEach((route) => console.log(`- ${route.name} (${route.variants.length} variante/s)`));
    return;
  }
  if (cfg.limit > 0) routes = routes.slice(0, cfg.limit);
  if (!routes.length) throw new Error(`No encontre ruta con filtro ${cfg.route}`);
  await fs.mkdir(cfg.output, { recursive: true });
  const index = { type: 'routes-index', generatedAt: new Date().toISOString(), algorithm: 'hybrid-route-and-topology-snap-v1', routes: [] };
  const report = { generatedAt: new Date().toISOString(), input: cfg.input, routes: [] };
  for (const route of routes) {
    console.log(`Alineando ${route.name}`);
    const features = [];
    const routeReport = { id: route.id, name: route.name, variants: [] };
    for (const variant of route.variants) {
      const aligned = await hybridAlign(variant.source, variant.direction);
      features.push(feature(route, variant, aligned));
      routeReport.variants.push({ direction: variant.direction, file: variant.file, segments: aligned.segments, metrics: features.at(-1).properties.alignment });
    }
    await fs.writeFile(path.join(cfg.output, `${route.id}.geojson`), `${JSON.stringify({ type: 'FeatureCollection', features })}\n`);
    index.routes.push({ id: route.id, name: route.name, color: route.color, transportType: route.transportType, colorName: route.colorName, colorLetter: route.colorLetter, geojsonFile: `/routes/${route.id}.geojson` });
    report.routes.push(routeReport);
  }
  await fs.writeFile(path.join(cfg.output, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  await fs.writeFile(path.join(cfg.output, 'ALIGNMENT_REPORT.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Listo. Salida: ${cfg.output}`);
}
main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
