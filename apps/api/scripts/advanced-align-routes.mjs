#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OSRM = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
const arg = (name, fallback = '') => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const has = (name) => process.argv.includes(name);
const resolvePath = (value) => { const clean = String(value || '').trim().replace(/^['"]|['"]$/g, ''); return path.isAbsolute(clean) ? path.normalize(clean) : path.resolve(ROOT, clean); };

const cfg = {
  input: resolvePath(arg('--input', 'rutastransporte')),
  output: resolvePath(arg('--output', 'apps/web/public/routes')),
  route: arg('--route', ''),
  limit: Number(arg('--limit', '0')),
  densify: Number(arg('--densify', '10')),
  radius: Number(arg('--radius', '55')),
  candidates: Number(arg('--candidates', '6')),
  straightGap: Number(arg('--straight-gap', '260')),
  turnGap: Number(arg('--turn-gap', '55')),
  turnAngle: Number(arg('--turn-angle', '18')),
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
function lineLength(line) { return line.slice(1).reduce((sum, point, index) => sum + meters(line[index], point), 0); }
function bearing(a, b) {
  const lat1 = toRad(a[1]); const lat2 = toRad(b[1]); const dLon = toRad(b[0] - a[0]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function bearingDelta(a, b) { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
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
    const a = line[i]; const b = line[i + 1];
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
  const dx = b.x - a.x; const dy = b.y - a.y;
  if (!dx && !dy) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}
function distanceToLine(point, line, project) {
  const p = project(point);
  let best = Infinity;
  for (let i = 1; i < line.length; i += 1) best = Math.min(best, pointSegmentDistance(p, project(line[i - 1]), project(line[i])));
  return best;
}
function percentile(values, p) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0; }
function quality(source, candidate) {
  const sourceLen = Math.max(1, lineLength(source));
  const candidateLen = lineLength(candidate);
  const project = projectFactory(source.concat(candidate));
  const sourceSample = densify(source, 18);
  const candidateSample = densify(candidate, 18);
  const sourceToCandidate = sourceSample.map((point) => distanceToLine(point, candidate, project));
  const candidateToSource = candidateSample.map((point) => distanceToLine(point, source, project));
  return {
    sourceLen,
    candidateLen,
    ratio: candidateLen / sourceLen,
    p95SourceToCandidate: percentile(sourceToCandidate, 0.95),
    p95CandidateToSource: percentile(candidateToSource, 0.95),
    maxCandidateToSource: Math.max(...candidateToSource, 0),
  };
}
function isStraight(line) {
  if (line.length < 3) return true;
  const direct = meters(line[0], line.at(-1));
  const len = Math.max(1, lineLength(line));
  let maxTurn = 0;
  let totalTurn = 0;
  for (let i = 1; i < line.length - 1; i += 1) {
    const turn = bearingDelta(bearing(line[i - 1], line[i]), bearing(line[i], line[i + 1]));
    maxTurn = Math.max(maxTurn, turn);
    if (turn > 4) totalTurn += turn;
  }
  return direct / len > 0.96 && maxTurn < 18 && totalTurn < 55;
}
function accepted(candidateQuality, mode) {
  if (mode === 'straight') {
    return candidateQuality.ratio >= 0.70 && candidateQuality.ratio <= 1.28 && candidateQuality.p95CandidateToSource <= 16 && candidateQuality.maxCandidateToSource <= 35;
  }
  return candidateQuality.ratio >= 0.45 && candidateQuality.ratio <= 1.85 && candidateQuality.p95SourceToCandidate <= 28 && candidateQuality.p95CandidateToSource <= 40 && candidateQuality.maxCandidateToSource <= 80;
}
async function collectFiles(target) {
  const out = [];
  async function visit(item) {
    const stat = await fs.stat(item).catch(() => null);
    if (!stat) return;
    if (stat.isFile()) { if (/\.(kml|geojson|json)$/i.test(item)) out.push(item); return; }
    for (const entry of await fs.readdir(item)) if (!entry.startsWith('.')) await visit(path.join(item, entry));
  }
  await visit(target);
  return out.sort();
}
function tag(block, name) { const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i')); return match ? xml(match[1].replace(/<[^>]+>/g, '').trim()) : ''; }
function routeNameFromFile(file) {
  const base = pretty(path.basename(file, path.extname(file)));
  const grandParent = pretty(path.basename(path.dirname(path.dirname(file))));
  return /^(kml|mapa|shape|combi|autobus|microbus|microbuc)$/i.test(base) ? grandParent || base : base || grandParent || 'Ruta';
}
function parseCoordinates(text) { return String(text).trim().split(/\s+/).map((item) => item.split(',').map(Number)).filter((item) => Number.isFinite(item[0]) && Number.isFinite(item[1])).map(([lon, lat]) => [lon, lat]); }
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
  const response = await fetch(url, { headers: { 'user-agent': 'ViaMoreliaAdvancedAligner/1.0' } });
  if (!response.ok) return [{ xy: point, d: cfg.radius }];
  const data = await response.json();
  const candidates = (data.waypoints || []).map((waypoint) => ({ xy: waypoint.location || point, d: waypoint.distance ?? cfg.radius })).filter((candidate) => candidate.d <= cfg.radius);
  const result = candidates.length ? candidates : [{ xy: point, d: cfg.radius }];
  nearestCache.set(key, result);
  return result;
}
async function osrmMatch(points) {
  const coords = points.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(';');
  const radiuses = points.map(() => cfg.radius).join(';');
  const url = `${OSRM.replace(/\/$/, '')}/match/v1/driving/${coords}?overview=full&geometries=geojson&steps=false&annotations=false&gaps=ignore&tidy=true&radiuses=${radiuses}`;
  const response = await fetch(url, { headers: { 'user-agent': 'ViaMoreliaAdvancedAligner/1.0' } });
  if (!response.ok) throw new Error(`match ${response.status}`);
  const data = await response.json();
  const line = (data.matchings || []).flatMap((matching) => matching.geometry?.coordinates || []);
  if (line.length < 2) throw new Error('match empty');
  return dedupe(line);
}
async function osrmRoute(a, b) {
  const url = `${OSRM.replace(/\/$/, '')}/route/v1/driving/${a[0].toFixed(6)},${a[1].toFixed(6)};${b[0].toFixed(6)},${b[1].toFixed(6)}?overview=full&geometries=geojson&steps=false&continue_straight=true`;
  const response = await fetch(url, { headers: { 'user-agent': 'ViaMoreliaAdvancedAligner/1.0' } });
  if (!response.ok) throw new Error(`route ${response.status}`);
  const data = await response.json();
  const line = data.routes?.[0]?.geometry?.coordinates;
  if (!line?.length) throw new Error('route empty');
  return dedupe(line);
}
function transitionCost(rawPrevious, rawNow, previous, now, straightMode) {
  const rawDistance = Math.max(1, meters(rawPrevious, rawNow));
  const snapDistance = meters(previous, now);
  let cost = Math.abs(snapDistance - rawDistance) * (straightMode ? 3.5 : 1.8);
  if (straightMode && snapDistance > Math.max(18, rawDistance * 1.8)) cost += 1200;
  if (!straightMode && snapDistance > Math.max(35, rawDistance * 3.0)) cost += 700;
  if (snapDistance < rawDistance * 0.10 && rawDistance > 8) cost += 80;
  return cost;
}
async function viterbiSnap(raw, straightMode) {
  const points = densify(raw, Math.max(7, cfg.densify));
  const candidateSets = [];
  for (let i = 0; i < points.length; i += 1) candidateSets.push(await nearestCandidates(points[i]));
  const scores = [candidateSets[0].map((candidate) => candidate.d * (straightMode ? 4 : 2))];
  const backs = [[]];
  for (let i = 1; i < candidateSets.length; i += 1) {
    const row = [];
    const back = [];
    for (const candidate of candidateSets[i]) {
      let best = Infinity;
      let bestIndex = 0;
      for (let j = 0; j < candidateSets[i - 1].length; j += 1) {
        const previous = candidateSets[i - 1][j];
        const cost = scores[i - 1][j] + candidate.d * (straightMode ? 4 : 2) + transitionCost(points[i - 1], points[i], previous.xy, candidate.xy, straightMode);
        if (cost < best) { best = cost; bestIndex = j; }
      }
      row.push(best);
      back.push(bestIndex);
    }
    scores.push(row);
    backs.push(back);
  }
  let index = scores.at(-1).reduce((best, value, i, arr) => (value < arr[best] ? i : best), 0);
  const out = [];
  for (let i = candidateSets.length - 1; i >= 0; i -= 1) {
    out.push(candidateSets[i][index].xy);
    index = backs[i][index] ?? 0;
  }
  return cleanSegment(dedupe(out.reverse()), raw, straightMode);
}
function cleanSegment(line, source, straightMode) {
  if (line.length < 3) return line;
  let current = line;
  for (let pass = 0; pass < 3; pass += 1) {
    const out = [current[0]];
    for (let i = 1; i < current.length - 1; i += 1) {
      const a = out.at(-1), b = current[i], c = current[i + 1];
      const ab = meters(a, b), bc = meters(b, c), ac = meters(a, c);
      const angle = bearingDelta(bearing(b, a), bearing(b, c));
      const detour = ab + bc > ac * (straightMode ? 1.35 : 2.0) && ac < (straightMode ? 120 : 65);
      if (detour) continue;
      if (ab < 4 || bc < 4) continue;
      if (straightMode && distanceToLine(b, [source[0], source.at(-1)], projectFactory(source.concat(line))) > 22) continue;
      if (angle > 150 && ac < 80) continue;
      out.push(b);
    }
    out.push(current.at(-1));
    current = dedupe(out);
  }
  return current;
}
function makeSegments(raw) {
  const dense = densify(raw, cfg.densify);
  const segments = [];
  let start = 0;
  let distanceSince = 0;
  let lastBearing = dense.length > 1 ? bearing(dense[0], dense[1]) : 0;
  for (let i = 1; i < dense.length - 1; i += 1) {
    distanceSince += meters(dense[i - 1], dense[i]);
    const nowBearing = bearing(dense[i], dense[i + 1]);
    const turn = bearingDelta(lastBearing, nowBearing);
    const rawSegment = dense.slice(start, i + 1);
    const straight = isStraight(rawSegment);
    const gap = straight ? cfg.straightGap : cfg.turnGap;
    const shouldSplit = distanceSince >= gap || (turn >= cfg.turnAngle && distanceSince >= 25 && !straight);
    if (shouldSplit) {
      segments.push({ source: dense.slice(start, i + 1), straight: isStraight(dense.slice(start, i + 1)) });
      start = i;
      distanceSince = 0;
      lastBearing = nowBearing;
    }
  }
  if (start < dense.length - 1) segments.push({ source: dense.slice(start), straight: isStraight(dense.slice(start)) });
  return segments.filter((segment) => segment.source.length > 1);
}
async function alignSegment(segment) {
  const raw = segment.source;
  const straightMode = segment.straight;
  const options = [];
  if (!straightMode && raw.length <= 95) {
    try {
      const match = await osrmMatch(raw.length > 60 ? raw.filter((_, i) => i % Math.ceil(raw.length / 60) === 0 || i === raw.length - 1) : raw);
      const q = quality(raw, match);
      if (accepted(q, 'turn')) options.push({ method: 'match', line: match, quality: q, score: q.p95SourceToCandidate + q.p95CandidateToSource + Math.abs(1 - q.ratio) * 20 });
    } catch { }
  }
  if (!straightMode) {
    const starts = (await nearestCandidates(raw[0])).slice(0, 3);
    const ends = (await nearestCandidates(raw.at(-1))).slice(0, 3);
    for (const start of starts) for (const end of ends) {
      try {
        const routed = await osrmRoute(start.xy, end.xy);
        const q = quality(raw, routed);
        if (accepted(q, 'turn')) options.push({ method: 'route', line: routed, quality: q, score: q.p95SourceToCandidate + q.p95CandidateToSource + Math.abs(1 - q.ratio) * 28 });
      } catch { }
    }
  }
  const snap = await viterbiSnap(raw, straightMode);
  const snapQ = quality(raw, snap);
  if (accepted(snapQ, straightMode ? 'straight' : 'turn') || !options.length) options.push({ method: straightMode ? 'straight-snap' : 'snap', line: snap, quality: snapQ, score: snapQ.p95SourceToCandidate + snapQ.p95CandidateToSource + Math.abs(1 - snapQ.ratio) * 18 });
  return options.sort((a, b) => a.score - b.score)[0];
}
async function alignRoute(raw, label) {
  const segments = makeSegments(raw);
  const out = [];
  const report = [];
  for (let i = 0; i < segments.length; i += 1) {
    if (i % 10 === 0) console.log(`  ${label}: segmento ${i + 1}/${segments.length}`);
    const aligned = await alignSegment(segments[i]);
    out.push(...aligned.line);
    report.push({ method: aligned.method, straight: segments[i].straight, sourceM: Math.round(aligned.quality.sourceLen), alignedM: Math.round(aligned.quality.candidateLen), ratio: Number(aligned.quality.ratio.toFixed(3)) });
  }
  return { line: cleanSegment(dedupe(out), raw, false), segments: report };
}
function color(name) { const n = norm(name); if (n.includes('azul')) return ['#004E98', 'Azul', 'A']; if (n.includes('verde')) return ['#70A800', 'Verde', 'V']; if (n.includes('naranja')) return ['#FF5500', 'Naranja', 'N']; if (n.includes('guinda')) return ['#611240', 'Guinda', 'G']; if (n.includes('morad')) return ['#8238EA', 'Morada', 'M']; if (n.includes('cafe')) return ['#8B4513', 'Café', 'C']; return ['#FFC800', 'Amarillo', 'A']; }
function groupRoutes(items) {
  const routes = new Map();
  const filter = norm(cfg.route);
  for (const item of items) {
    if (filter && !norm(`${item.name} ${item.file}`).includes(filter)) continue;
    const name = pretty(item.name).replace(/\s*(ida|vuelta|regreso|retorno)$/i, '').trim();
    const id = slug(name);
    if (!routes.has(id)) { const [lineColor, colorName, colorLetter] = color(name); routes.set(id, { id, name, color: lineColor, colorName, colorLetter, transportType: 'Combi', variants: [] }); }
    const route = routes.get(id);
    const direction = /vuelta|regreso|retorno/.test(norm(item.name)) ? 'vuelta' : /ida|salida/.test(norm(item.name)) ? 'ida' : route.variants.length ? 'vuelta' : 'ida';
    route.variants.push({ direction, source: item.line, file: item.file });
  }
  return [...routes.values()].sort((a, b) => a.name.localeCompare(b.name, 'es-MX'));
}
function feature(route, variant, aligned) {
  return { type: 'Feature', properties: { routeId: route.id, routeName: route.name, direction: variant.direction, color: route.color, casingColor: '#222222', longKm: Number((lineLength(aligned.line) / 1000).toFixed(4)), transportType: route.transportType, name: variant.direction === 'vuelta' ? 'Vuelta' : 'Ida', alignment: { method: 'advanced-intersection-safe-hybrid', sourceLengthM: Math.round(lineLength(variant.source)), alignedLengthM: Math.round(lineLength(aligned.line)), lengthRatio: Number((lineLength(aligned.line) / Math.max(1, lineLength(variant.source))).toFixed(4)), segmentCount: aligned.segments.length } }, geometry: { type: 'LineString', coordinates: aligned.line } };
}
async function main() {
  const files = await collectFiles(cfg.input);
  if (!files.length) throw new Error(`No encontre KML/GeoJSON en ${cfg.input}`);
  if (has('--list-files')) { files.forEach((file) => console.log(`- ${file} -> ${routeNameFromFile(file)}`)); return; }
  let items = [];
  for (const file of files) { const text = await fs.readFile(file, 'utf8'); items.push(...(/\.kml$/i.test(file) ? parseKml(text, file) : parseGeojson(text, file))); }
  let routes = groupRoutes(items);
  if (has('--list-routes')) { routes.forEach((route) => console.log(`- ${route.name} (${route.variants.length} variante/s)`)); return; }
  if (cfg.limit > 0) routes = routes.slice(0, cfg.limit);
  if (!routes.length) throw new Error(`No encontre ruta con filtro ${cfg.route}`);
  await fs.mkdir(cfg.output, { recursive: true });
  const index = { type: 'routes-index', generatedAt: new Date().toISOString(), algorithm: 'advanced-intersection-safe-hybrid-v1', routes: [] };
  const report = { generatedAt: new Date().toISOString(), input: cfg.input, routes: [] };
  for (const route of routes) {
    console.log(`Alineando ${route.name}`);
    const features = [];
    const routeReport = { id: route.id, name: route.name, variants: [] };
    for (const variant of route.variants) {
      const aligned = await alignRoute(variant.source, variant.direction);
      const featureItem = feature(route, variant, aligned);
      features.push(featureItem);
      routeReport.variants.push({ direction: variant.direction, file: variant.file, metrics: featureItem.properties.alignment, segments: aligned.segments });
    }
    await fs.writeFile(path.join(cfg.output, `${route.id}.geojson`), `${JSON.stringify({ type: 'FeatureCollection', features })}\n`);
    index.routes.push({ id: route.id, name: route.name, color: route.color, transportType: route.transportType, colorName: route.colorName, colorLetter: route.colorLetter, geojsonFile: `/routes/${route.id}.geojson` });
    report.routes.push(routeReport);
  }
  await fs.writeFile(path.join(cfg.output, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  await fs.writeFile(path.join(cfg.output, 'ALIGNMENT_REPORT.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Listo. Salida: ${cfg.output}`);
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
