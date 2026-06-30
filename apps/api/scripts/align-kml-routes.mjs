#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org';
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const GENERIC_NAMES = new Set(['autobus', 'bus', 'camion', 'combi', 'microbus', 'microbuc', 'micro']);

function projectPath(value) {
  if (!value) return value;
  return path.isAbsolute(value) ? value : path.resolve(REPO_ROOT, value);
}

function args(argv) {
  const out = {
    input: projectPath(process.env.ROUTES_INPUT_DIR ?? 'rutastransporte'),
    output: projectPath(process.env.ROUTES_OUTPUT_DIR ?? 'apps/web/public/routes'),
    route: process.env.ROUTE_FILTER ?? '',
    limit: Number(process.env.ROUTE_LIMIT ?? '0'),
    osrm: process.env.OSRM_BASE_URL ?? DEFAULT_OSRM_BASE_URL,
    radius: Number(process.env.MATCH_RADIUS_METERS ?? '65'),
    densify: Number(process.env.DENSIFY_METERS ?? '18'),
    chunk: Number(process.env.OSRM_MAX_CHUNK_POINTS ?? '90'),
    allowImperfect: false,
    listRoutes: false,
    listFiles: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--input') { out.input = projectPath(v); i += 1; }
    else if (k === '--output') { out.output = projectPath(v); i += 1; }
    else if (k === '--route') { out.route = v; i += 1; }
    else if (k === '--limit') { out.limit = Number(v); i += 1; }
    else if (k === '--osrm') { out.osrm = v; i += 1; }
    else if (k === '--radius') { out.radius = Number(v); i += 1; }
    else if (k === '--densify') { out.densify = Number(v); i += 1; }
    else if (k === '--chunk') { out.chunk = Number(v); i += 1; }
    else if (k === '--allow-imperfect') out.allowImperfect = true;
    else if (k === '--list-routes') out.listRoutes = true;
    else if (k === '--list-files') out.listFiles = true;
    else throw new Error(`Argumento desconocido: ${k}`);
  }
  return out;
}

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ruta';
const xml = (s) => String(s ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const pretty = (s) => String(s ?? '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

function isGenericName(value) {
  const n = norm(value).replace(/[^a-z0-9]+/g, ' ').trim();
  return !n || GENERIC_NAMES.has(n);
}

function removeNumericPrefix(value) {
  return String(value ?? '').replace(/^\s*\d+\s*[-_. ]\s*/, '').trim();
}

function routeNameFromFile(file) {
  const parts = path.relative(REPO_ROOT, file).split(path.sep).filter(Boolean);
  const basename = removeNumericPrefix(pretty(path.basename(file, path.extname(file))));
  const parent = removeNumericPrefix(pretty(parts.length > 1 ? parts[parts.length - 2] : ''));
  if (!isGenericName(basename) && !/^\d+$/.test(basename)) return basename;
  if (!isGenericName(parent) && !/^\d+$/.test(parent)) return parent;
  return basename || parent || path.basename(file, path.extname(file));
}

function pickRouteName(rawName, file) {
  const fromFile = routeNameFromFile(file);
  if (isGenericName(rawName)) return fromFile;
  const cleanRaw = pretty(rawName);
  const cleanFile = pretty(fromFile);
  if (norm(cleanFile).includes(norm(cleanRaw)) && cleanFile.length > cleanRaw.length) return cleanFile;
  return cleanRaw || cleanFile;
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? xml(m[1].replace(/<[^>]+>/g, '').trim()) : '';
}

function coords(block) {
  return String(block).trim().split(/\s+/).map((p) => p.split(',').map(Number)).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).map(([lon, lat]) => [lon, lat]);
}

function dedupe(line, eps = 1e-7) {
  const out = [];
  for (const p of line) {
    const last = out.at(-1);
    if (!last || Math.abs(last[0] - p[0]) > eps || Math.abs(last[1] - p[1]) > eps) out.push([Number(p[0]), Number(p[1])]);
  }
  return out;
}

function parseKml(text, file) {
  const items = [];
  const placemarks = text.match(/<Placemark[\s\S]*?<\/Placemark>/gi) ?? [text];
  placemarks.forEach((pm, pmIndex) => {
    const rawName = tag(pm, 'name') || path.basename(file, path.extname(file));
    const name = pickRouteName(rawName, file);
    const lines = [...pm.matchAll(/<LineString[\s\S]*?<coordinates[^>]*>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/gi)];
    lines.forEach((m, lineIndex) => {
      const line = dedupe(coords(m[1]));
      if (line.length > 1) items.push({ file, name, rawName, pmIndex, lineIndex, line });
    });
  });
  return items;
}

function parseGeojson(text, file) {
  const json = JSON.parse(text);
  const features = json.type === 'FeatureCollection' ? json.features : [json];
  const items = [];
  features.forEach((f, i) => {
    const g = f.geometry ?? f;
    const p = f.properties ?? {};
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    lines.forEach((line, j) => {
      const clean = dedupe(line.map(([lon, lat]) => [Number(lon), Number(lat)]).filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat)));
      const rawName = p.routeName || p.name || p.route_id || path.basename(file, path.extname(file));
      if (clean.length > 1) items.push({ file, name: pickRouteName(rawName, file), rawName, pmIndex: i, lineIndex: j, line: clean });
    });
  });
  return items;
}

async function walk(root) {
  const files = [];
  async function visit(p) {
    const st = await fs.stat(p).catch(() => null);
    if (!st) return;
    if (st.isDirectory()) {
      for (const entry of await fs.readdir(p)) if (!entry.startsWith('.')) await visit(path.join(p, entry));
    } else if (/\.(kml|geojson|json)$/i.test(p)) files.push(p);
  }
  await visit(root);
  return files.sort();
}

function baseRouteName(name) {
  return String(name).replace(/\s*[-_/()]?\s*(ida|vuelta|regreso|retorno)\s*[)]?\s*$/i, '').trim() || 'Ruta sin nombre';
}

function direction(name, index) {
  const n = norm(name);
  if (/\bvuelta\b|\bregreso\b|\bretorno\b/.test(n)) return 'vuelta';
  if (/\bida\b|\bsalida\b/.test(n)) return 'ida';
  return index === 0 ? 'ida' : 'vuelta';
}

function colorMeta(name) {
  const n = norm(name);
  if (n.includes('azul')) return ['#004E98', 'Azul', 'A'];
  if (n.includes('verde')) return ['#70A800', 'Verde', 'V'];
  if (n.includes('naranja')) return ['#FF5500', 'Naranja', 'N'];
  if (n.includes('guinda')) return ['#611240', 'Guinda', 'G'];
  if (n.includes('morad')) return ['#8238EA', 'Morada', 'M'];
  if (n.includes('cafe')) return ['#8B4513', 'Café', 'C'];
  if (n.includes('gris')) return ['#808080', 'Gris', 'G'];
  if (n.includes('negra')) return ['#000000', 'Negra', 'N'];
  if (n.includes('dorado') || n.includes('oro')) return ['#D1BE3C', 'Dorado', 'D'];
  return ['#FFC800', n.includes('alberca') ? 'Alberca' : 'Amarillo', 'A'];
}

function typeMeta(name, rawName = '') {
  const n = norm(`${name} ${rawName}`);
  if (n.includes('microbus') || n.includes('microbuc')) return 'Microbús';
  if (n.includes('autobus') || n.includes('camion')) return 'Autobús';
  return 'Combi';
}

function group(items, filter) {
  const f = norm(filter);
  const routes = new Map();
  for (const item of items) {
    const haystack = norm(`${item.name} ${item.rawName ?? ''} ${item.file}`);
    if (f && !haystack.includes(f)) continue;
    const name = baseRouteName(item.name);
    const id = slug(name);
    if (!routes.has(id)) {
      const [color, colorName, colorLetter] = colorMeta(name);
      routes.set(id, { id, name, color, colorName, colorLetter, transportType: typeMeta(name, item.rawName), variants: [] });
    }
    const route = routes.get(id);
    route.variants.push({ id: `${id}-${route.variants.length}`, direction: direction(`${item.name} ${item.rawName ?? ''}`, route.variants.length), sourceName: item.name, sourceFile: item.file, source: item.line });
  }
  return [...routes.values()].sort((a, b) => a.name.localeCompare(b.name, 'es-MX'));
}

const rad = (x) => x * Math.PI / 180;
function dist(a, b) {
  const R = 6371008.8;
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const la1 = rad(a[1]);
  const la2 = rad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function length(line) { return line.slice(1).reduce((sum, p, i) => sum + dist(line[i], p), 0); }

function densify(line, every) {
  const out = [];
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i], b = line[i + 1];
    if (!out.length) out.push(a);
    const steps = Math.max(1, Math.ceil(dist(a, b) / every));
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return dedupe(out);
}

function chunks(line, max) {
  const out = [];
  let start = 0;
  while (start < line.length - 1) {
    const end = Math.min(line.length, start + max);
    out.push(line.slice(start, end));
    start = end - 1;
  }
  return out;
}

function enc(line) { return line.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(';'); }

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'ViaMoreliaRouteAligner/1.0' } });
    const body = await res.text();
    if (!res.ok) throw new Error(`${res.status}: ${body.slice(0, 180)}`);
    return JSON.parse(body);
  } finally {
    clearTimeout(timer);
  }
}

async function matchOsrm(line, cfg, radius) {
  const radiuses = line.map(() => radius).join(';');
  const url = `${cfg.osrm.replace(/\/$/, '')}/match/v1/driving/${enc(line)}?geometries=geojson&overview=full&gaps=ignore&tidy=true&steps=false&annotations=false&radiuses=${radiuses}`;
  const data = await getJson(url);
  if (data.code !== 'Ok' || !data.matchings?.length) throw new Error(`match ${data.code ?? 'sin respuesta'}`);
  const out = data.matchings.flatMap((m) => m.geometry?.coordinates ?? []);
  if (out.length < 2) throw new Error('match sin geometria');
  return dedupe(out);
}

async function routeOsrm(line, cfg) {
  const every = Math.max(2, Math.floor(line.length / 22));
  const anchors = line.filter((_, i) => i === 0 || i === line.length - 1 || i % every === 0);
  const url = `${cfg.osrm.replace(/\/$/, '')}/route/v1/driving/${enc(anchors)}?geometries=geojson&overview=full&steps=false&continue_straight=false`;
  const data = await getJson(url);
  if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates?.length) throw new Error(`route ${data.code ?? 'sin respuesta'}`);
  return dedupe(data.routes[0].geometry.coordinates);
}

function projector(line) {
  const lat0 = line.reduce((s, p) => s + p[1], 0) / line.length;
  const mx = 111320 * Math.cos(rad(lat0));
  return ([lon, lat]) => ({ x: lon * mx, y: lat * 110540 });
}

function pointSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (!dx && !dy) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function offset(point, line, project) {
  const p = project(point);
  let best = Infinity;
  for (let i = 1; i < line.length; i += 1) best = Math.min(best, pointSeg(p, project(line[i - 1]), project(line[i])));
  return best;
}

function validate(source, aligned) {
  const sample = densify(source, 25);
  const project = projector(source.concat(aligned));
  const offsets = sample.map((p) => offset(p, aligned, project)).sort((a, b) => a - b);
  const avg = offsets.reduce((s, x) => s + x, 0) / Math.max(1, offsets.length);
  const max = offsets.at(-1) ?? 0;
  const p95 = offsets[Math.floor(offsets.length * 0.95)] ?? 0;
  const unmatched = offsets.filter((x) => x > 35).length;
  const ratio = length(aligned) / Math.max(1, length(source));
  const passed = avg <= 12 && p95 <= 30 && max <= 80 && unmatched === 0 && ratio >= 0.75 && ratio <= 1.45;
  return { passed, avgOffsetM: +avg.toFixed(2), p95OffsetM: +p95.toFixed(2), maxOffsetM: +max.toFixed(2), unmatchedPoints: unmatched, sourceLengthM: Math.round(length(source)), alignedLengthM: Math.round(length(aligned)), lengthRatio: +ratio.toFixed(4) };
}

async function alignVariant(variant, cfg) {
  const input = densify(variant.source, cfg.densify);
  const parts = chunks(input, cfg.chunk);
  const out = [];
  const attempts = [];
  for (const [index, part] of parts.entries()) {
    let ok = null;
    for (const radius of [cfg.radius, cfg.radius * 1.5, cfg.radius * 2]) {
      try {
        ok = await matchOsrm(part, cfg, radius);
        attempts.push({ index, method: 'osrm-match', radius, ok: true });
        break;
      } catch (e) {
        attempts.push({ index, method: 'osrm-match', radius, ok: false, error: e.message });
      }
    }
    if (!ok) {
      ok = await routeOsrm(part, cfg);
      attempts.push({ index, method: 'osrm-route-fallback', ok: true });
    }
    out.push(...ok);
  }
  const aligned = dedupe(out);
  const metrics = validate(variant.source, aligned);
  return { ...variant, aligned, metrics, attempts };
}

function feature(route, variant) {
  return {
    type: 'Feature',
    properties: { id: variant.id, routeId: route.id, routeName: route.name, direction: variant.direction, color: route.color, casingColor: '#222222', longKm: +(length(variant.aligned) / 1000).toFixed(4), transportType: route.transportType, name: variant.direction === 'vuelta' ? 'Vuelta' : 'Ida', alignment: variant.metrics },
    geometry: { type: 'LineString', coordinates: variant.aligned },
  };
}

async function main() {
  const cfg = args(process.argv.slice(2));
  const files = await walk(cfg.input);
  if (!files.length) {
    throw new Error(`No se encontraron KML/GeoJSON en: ${cfg.input}`);
  }

  if (cfg.listFiles) {
    console.log(`Input: ${cfg.input}`);
    console.log(`Archivos encontrados: ${files.length}`);
    for (const file of files) console.log(`- ${path.relative(REPO_ROOT, file)} -> ${routeNameFromFile(file)}`);
    return;
  }

  const sources = [];
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    try { sources.push(...(/\.kml$/i.test(file) ? parseKml(text, file) : parseGeojson(text, file))); }
    catch (e) { console.warn(`[WARN] ${file}: ${e.message}`); }
  }

  if (!sources.length) throw new Error(`Se encontraron ${files.length} archivo(s), pero ninguno tenia LineString valido.`);

  const allRoutes = group(sources, '');
  if (cfg.listRoutes) {
    console.log(`Input: ${cfg.input}`);
    console.log(`Archivos leidos: ${files.length}`);
    console.log('Rutas detectadas:');
    for (const route of allRoutes) console.log(`- ${route.name} (${route.variants.length} variante/s)`);
    return;
  }

  let routes = group(sources, cfg.route);
  if (cfg.limit > 0) routes = routes.slice(0, cfg.limit);
  if (!routes.length) {
    const needle = norm(cfg.route);
    const suggestions = allRoutes
      .map((route) => route.name)
      .filter((name) => norm(name).includes(needle.split(' ')[0] ?? needle) || needle.includes(norm(name).split(' ')[0] ?? ''))
      .slice(0, 12);
    const hint = suggestions.length ? `\nSugerencias:\n- ${suggestions.join('\n- ')}` : `\nEjecuta con --list-routes o --list-files para ver los nombres detectados.`;
    throw new Error(`No encontre rutas con filtro: ${cfg.route}\nInput resuelto: ${cfg.input}\nArchivos leidos: ${files.length}${hint}`);
  }

  const report = { generatedAt: new Date().toISOString(), input: cfg.input, osrm: cfg.osrm, routes: [] };
  const index = { type: 'routes-index', generatedAt: new Date().toISOString(), algorithm: 'osrm-road-network-map-matching-v1', routes: [] };
  await fs.mkdir(cfg.output, { recursive: true });

  for (const route of routes) {
    console.log(`Alineando ${route.name}`);
    const variants = [];
    for (const v of route.variants) {
      const aligned = await alignVariant(v, cfg);
      if (!cfg.allowImperfect && !aligned.metrics.passed) throw new Error(`${route.name} ${v.direction} no paso validacion: ${JSON.stringify(aligned.metrics)}`);
      variants.push(aligned);
    }
    route.variants = variants;
    await fs.writeFile(path.join(cfg.output, `${route.id}.geojson`), JSON.stringify({ type: 'FeatureCollection', features: variants.map((v) => feature(route, v)) }) + '\n');
    index.routes.push({ id: route.id, name: route.name, color: route.color, transportType: route.transportType, colorName: route.colorName, colorLetter: route.colorLetter, geojsonFile: `/routes/${route.id}.geojson` });
    report.routes.push({ id: route.id, name: route.name, variants: variants.map((v) => ({ id: v.id, direction: v.direction, sourceFile: v.sourceFile, metrics: v.metrics, attempts: v.attempts })) });
  }
  await fs.writeFile(path.join(cfg.output, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  await fs.writeFile(path.join(cfg.output, 'ALIGNMENT_REPORT.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Listo: ${routes.length} ruta(s). Salida: ${cfg.output}`);
}

main().catch((e) => { console.error(e.stack || e.message); process.exitCode = 1; });
