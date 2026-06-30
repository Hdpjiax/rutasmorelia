#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OSRM = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
const GENERIC = new Set(['autobus', 'bus', 'camion', 'combi', 'microbus', 'microbuc', 'micro']);

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ruta';
const pretty = (s) => String(s || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
const xml = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
function has(name) { return process.argv.includes(name); }
function full(p) { return path.isAbsolute(p) ? p : path.resolve(ROOT, p); }

const cfg = {
  input: full(arg('--input', 'rutastransporte')),
  output: full(arg('--output', 'apps/web/public/routes')),
  route: arg('--route', ''),
  limit: Number(arg('--limit', '0')),
  step: Number(arg('--densify', '35')),
  radius: Number(arg('--radius', '45')),
  listRoutes: has('--list-routes'),
  listFiles: has('--list-files'),
};

function generic(s) {
  const n = norm(s).replace(/[^a-z0-9]+/g, ' ').trim();
  return !n || GENERIC.has(n);
}
function routeNameFromFile(file) {
  const rel = path.relative(ROOT, file).split(path.sep).filter(Boolean);
  const base = pretty(path.basename(file, path.extname(file))).replace(/^\d+\s*[-_. ]\s*/, '');
  const parent = pretty(rel.length > 1 ? rel[rel.length - 2] : '').replace(/^\d+\s*[-_. ]\s*/, '');
  if (!generic(base) && !/^\d+$/.test(base)) return base;
  if (!generic(parent) && !/^\d+$/.test(parent)) return parent;
  return base || parent || path.basename(file, path.extname(file));
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? xml(m[1].replace(/<[^>]+>/g, '').trim()) : '';
}
function pickName(raw, file) {
  const byFile = routeNameFromFile(file);
  if (generic(raw)) return byFile;
  return pretty(raw || byFile);
}
function parseCoords(text) {
  return String(text).trim().split(/\s+/).map((p) => p.split(',').map(Number)).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).map(([lon, lat]) => [lon, lat]);
}
function clean(line) {
  const out = [];
  for (const p of line) {
    const last = out.at(-1);
    if (!last || Math.abs(last[0] - p[0]) > 1e-7 || Math.abs(last[1] - p[1]) > 1e-7) out.push(p);
  }
  return out;
}
function parseKml(text, file) {
  const items = [];
  const placemarks = text.match(/<Placemark[\s\S]*?<\/Placemark>/gi) || [text];
  for (const pm of placemarks) {
    const name = pickName(tag(pm, 'name') || path.basename(file, path.extname(file)), file);
    for (const m of pm.matchAll(/<LineString[\s\S]*?<coordinates[^>]*>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/gi)) {
      const line = clean(parseCoords(m[1]));
      if (line.length > 1) items.push({ file, name, line });
    }
  }
  return items;
}
function parseGeojson(text, file) {
  const json = JSON.parse(text);
  const features = json.type === 'FeatureCollection' ? json.features : [json];
  const items = [];
  for (const f of features) {
    const g = f.geometry || f;
    const p = f.properties || {};
    const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const line of lines) {
      const c = clean(line.map(([lon, lat]) => [Number(lon), Number(lat)]).filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat)));
      if (c.length > 1) items.push({ file, name: pickName(p.routeName || p.name || p.route_id, file), line: c });
    }
  }
  return items;
}
async function files(root) {
  const out = [];
  const input = String(root || '').trim().replace(/^['"]|['"]$/g, '');
  const candidates = [
    input,
    path.normalize(input),
    input.replace(/\\/g, path.sep),
    input.replace(/\//g, path.sep),
  ];

  async function visit(p) {
    const normalized = path.normalize(p);
    const st = await fs.stat(normalized).catch(() => null);
    if (!st) return;

    if (st.isFile()) {
      if (/\.(kml|geojson|json)$/i.test(normalized)) {
        out.push(normalized);
      }
      return;
    }

    if (st.isDirectory()) {
      for (const e of await fs.readdir(normalized)) {
        if (!e.startsWith('.')) {
          await visit(path.join(normalized, e));
        }
      }
    }
  }

  for (const candidate of candidates) {
    await visit(candidate);
  }

  return [...new Set(out)].sort();
}
const rad = (x) => x * Math.PI / 180;
function dist(a, b) {
  const h = Math.sin(rad(b[1] - a[1]) / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function len(line) { return line.slice(1).reduce((s, p, i) => s + dist(line[i], p), 0); }
function densify(line, every) {
  const out = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    if (!out.length) out.push(a);
    const steps = Math.max(1, Math.ceil(dist(a, b) / every));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return clean(out);
}
const cache = new Map();
async function nearest(p) {
  const key = `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  if (cache.has(key)) return cache.get(key);
  const url = `${OSRM.replace(/\/$/, '')}/nearest/v1/driving/${p[0].toFixed(6)},${p[1].toFixed(6)}?number=1`;
  const res = await fetch(url, { headers: { 'user-agent': 'ViaMoreliaSnapper/1.0' } });
  const body = await res.text();
  if (!res.ok) throw new Error(`nearest ${res.status}: ${body.slice(0, 120)}`);
  const data = JSON.parse(body);
  const wp = data.waypoints?.[0];
  const snapped = wp?.distance <= cfg.radius && wp.location ? wp.location : p;
  cache.set(key, snapped);
  return snapped;
}
function color(name) {
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
function group(items) {
  const out = new Map();
  const filter = norm(cfg.route);
  for (const item of items) {
    if (filter && !norm(`${item.name} ${item.file}`).includes(filter)) continue;
    const name = item.name.replace(/\s*[-_/()]?\s*(ida|vuelta|regreso|retorno)\s*[)]?\s*$/i, '').trim();
    const id = slug(name);
    if (!out.has(id)) {
      const [c, colorName, colorLetter] = color(name);
      out.set(id, { id, name, color: c, colorName, colorLetter, transportType: 'Combi', variants: [] });
    }
    const route = out.get(id);
    const n = norm(item.name);
    const direction = /vuelta|regreso|retorno/.test(n) ? 'vuelta' : /ida|salida/.test(n) ? 'ida' : route.variants.length === 0 ? 'ida' : 'vuelta';
    route.variants.push({ direction, sourceFile: item.file, source: item.line });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, 'es-MX'));
}
function feature(route, variant, aligned) {
  return { type: 'Feature', properties: { routeId: route.id, routeName: route.name, direction: variant.direction, color: route.color, casingColor: '#222222', longKm: +(len(aligned) / 1000).toFixed(4), transportType: route.transportType, name: variant.direction === 'vuelta' ? 'Vuelta' : 'Ida', alignment: { method: 'osrm-nearest-snap', sourceLengthM: Math.round(len(variant.source)), alignedLengthM: Math.round(len(aligned)), lengthRatio: +(len(aligned) / Math.max(1, len(variant.source))).toFixed(4) } }, geometry: { type: 'LineString', coordinates: aligned } };
}
async function main() {
  const list = await files(cfg.input);
  if (!list.length) throw new Error(`No encontre archivos en ${cfg.input}`);
  if (cfg.listFiles) { for (const f of list) console.log(`- ${path.relative(ROOT, f)} -> ${routeNameFromFile(f)}`); return; }
  let items = [];
  for (const f of list) {
    const text = await fs.readFile(f, 'utf8');
    try { items.push(...(/\.kml$/i.test(f) ? parseKml(text, f) : parseGeojson(text, f))); } catch (e) { console.warn(`[WARN] ${f}: ${e.message}`); }
  }
  let routes = group(items);
  if (cfg.listRoutes) { for (const r of group(items.map((x) => ({ ...x })))) console.log(`- ${r.name} (${r.variants.length} variante/s)`); return; }
  if (cfg.limit > 0) routes = routes.slice(0, cfg.limit);
  if (!routes.length) throw new Error(`No encontre ruta con filtro: ${cfg.route}`);
  await fs.mkdir(cfg.output, { recursive: true });
  const index = { type: 'routes-index', generatedAt: new Date().toISOString(), algorithm: 'osrm-nearest-snap-v1', routes: [] };
  const report = { generatedAt: new Date().toISOString(), routes: [] };
  for (const route of routes) {
    console.log(`Alineando ${route.name}`);
    const features = [];
    for (const [i, v] of route.variants.entries()) {
      const dense = densify(v.source, cfg.step);
      const snapped = [];
      for (let j = 0; j < dense.length; j++) {
        if (j % 100 === 0) console.log(`  ${v.direction}: ${j}/${dense.length}`);
        snapped.push(await nearest(dense[j]));
      }
      const aligned = clean(snapped);
      features.push(feature(route, { ...v, id: `${route.id}-${i}` }, aligned));
    }
    await fs.writeFile(path.join(cfg.output, `${route.id}.geojson`), JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
    index.routes.push({ id: route.id, name: route.name, color: route.color, transportType: route.transportType, colorName: route.colorName, colorLetter: route.colorLetter, geojsonFile: `/routes/${route.id}.geojson` });
    report.routes.push({ id: route.id, name: route.name, variants: features.map((f) => f.properties) });
  }
  await fs.writeFile(path.join(cfg.output, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  await fs.writeFile(path.join(cfg.output, 'ALIGNMENT_REPORT.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Listo. Salida: ${cfg.output}`);
}
main().catch((e) => { console.error(e.stack || e.message); process.exitCode = 1; });
