#!/usr/bin/env node
/**
 * KML → GeoJSON Direct Converter
 *
 * NO usa OSRM. Las coordenadas KML ya son la ruta oficial (tessellate=1).
 * Simplemente convierte el KML a GeoJSON preservando las coordenadas exactas.
 * Si es necesario, la precisión submétrica de los puntos se mantiene.
 *
 * Las coordenadas KML se dibujarán sobre el mapa. Si quedan ligeramente
 * desplazadas del eje vial, es aceptable porque representan la ruta OFICIAL.
 *
 * Para mejor precisión futura: usar OSRM Nearest en cada punto (1 call/point).
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const KML_FILE = path.join(
  ROOT,
  "rutas/01_RUTAS_DE_COMBI/79_ALBERCA_GERTRUDIS/KML_alberga_g/Alberca_Gertrudis_kml.kml"
);
const OUTPUT_GEOJSON = path.join(ROOT, "apps/web/public/routes/79.geojson");
const OUTPUT_INDEX = path.join(ROOT, "apps/web/public/routes/index.json");

const ROUTE_COLOR = "#FFC800";
const CASING_COLOR = "#222222";
const ROUTE_ID = "79";
const ROUTE_NAME = "Alberca (Gertrudis)";

function parseKmlCoords(str) {
  return str.trim().split(/\s+/).filter(s => s.length > 0)
    .map(pair => { const p = pair.split(",").map(Number); return [p[0], p[1]]; });
}

function parseKml(filePath) {
  const xml = fs.readFileSync(filePath, "utf-8");
  const placemarks = [];
  const pmRe = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/g;
  let m;
  while ((m = pmRe.exec(xml)) !== null) {
    const block = m[1];
    const idMatch = block.match(/<td>Id<\/td>\s*\n?\s*<td>(\d+)<\/td>/);
    const longMatch = block.match(/<td>LONG_KM<\/td>\s*\n?\s*<td>([^<]+)<\/td>/);
    const nameMatch = block.match(/<td>RUTA<\/td>\s*\n?\s*<td>([^<]+)<\/td>/);
    const tipoMatch = block.match(/<td>TIPO<\/td>\s*\n?\s*<td>([^<]+)<\/td>/);
    const lineStrings = [];
    const lsRe = /<LineString[^>]*>([\s\S]*?)<\/LineString>/g;
    let ls;
    while ((ls = lsRe.exec(block)) !== null) {
      const cRe = ls[1].match(/<coordinates[^>]*>([\s\S]*?)<\/coordinates>/);
      if (cRe) { const coords = parseKmlCoords(cRe[1]); if (coords.length >= 2) lineStrings.push(coords); }
    }
    placemarks.push({
      id: idMatch ? parseInt(idMatch[1]) : 0,
      longKm: longMatch ? parseFloat(longMatch[1]) : 0,
      name: nameMatch ? nameMatch[1].trim() : "Alberca (Gertrudis)",
      tipo: tipoMatch ? tipoMatch[1].trim() : "Microbús",
      lineStrings,
    });
  }
  return placemarks;
}

function haversine(a, b) {
  const R = 6371000, toR = d => d * Math.PI / 180;
  const dLat = toR(b[1] - a[1]), dLon = toR(b[0] - a[0]);
  const la1 = toR(a[1]), la2 = toR(b[1]);
  return R * 2 * Math.atan2(
    Math.sqrt(Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2),
    Math.sqrt(1 - (Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2))
  );
}

function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += haversine(pts[i-1], pts[i]);
  return len;
}

function stitchLineStrings(lss) {
  if (lss.length === 0) return [];
  if (lss.length === 1) return [...lss[0]];
  const used = new Set();
  let si = 0, ml = 0;
  for (let i = 0; i < lss.length; i++) { if (lss[i].length > ml) { ml = lss[i].length; si = i; } }
  used.add(si);
  const ordered = [lss[si]];
  while (ordered.length < lss.length) {
    const last = ordered[ordered.length-1], lastPt = last[last.length-1];
    const first = ordered[0], firstPt = first[0];
    let bi = -1, bd = Infinity, ba = "";
    for (let i = 0; i < lss.length; i++) {
      if (used.has(i)) continue;
      const ls = lss[i];
      const checks = [
        { d: haversine(lastPt, ls[0]), a: "append-fwd" },
        { d: haversine(lastPt, ls[ls.length-1]), a: "append-rev" },
        { d: haversine(firstPt, ls[ls.length-1]), a: "prepend-fwd" },
        { d: haversine(firstPt, ls[0]), a: "prepend-rev" },
      ];
      for (const c of checks) { if (c.d < bd) { bd = c.d; bi = i; ba = c.a; } }
    }
    if (bi === -1 || bd > 50) break;
    used.add(bi);
    const seg = ba.includes("rev") ? [...lss[bi]].reverse() : lss[bi];
    if (ba.startsWith("append")) ordered.push(seg); else ordered.unshift(seg);
  }
  let result = [];
  for (const seg of ordered) {
    if (result.length > 0) {
      const lp = result[result.length-1], fp = seg[0];
      if (Math.abs(lp[0]-fp[0]) < 1e-8 && Math.abs(lp[1]-fp[1]) < 1e-8) result = result.concat(seg.slice(1));
      else result = result.concat(seg);
    } else result = [...seg];
  }
  return result;
}

function main() {
  console.log("══════════════════════════════════════════════════════════");
  console.log("  RUTAS MORELIA — KML → GeoJSON Direct Converter");
  console.log("  (sin OSRM, coordenadas KML exactas)");
  console.log("══════════════════════════════════════════════════════════\n");

  if (!fs.existsSync(KML_FILE)) { console.error("✖ No encontrado:", KML_FILE); process.exit(1); }
  fs.mkdirSync(path.dirname(OUTPUT_GEOJSON), { recursive: true });

  const placemarks = parseKml(KML_FILE);
  console.log(`KML: ${placemarks.length} placemarks\n`);

  const features = [];

  for (let pi = 0; pi < placemarks.length; pi++) {
    const pm = placemarks[pi];
    const dir = pi === 0 ? "ida" : "vuelta";
    const label = `${pm.name} — ${dir}`;

    console.log(`─`.repeat(50));
    console.log(`🚌 ${label}`);
    console.log(`   Id:${pm.id}, ${pm.lineStrings.length} segmentos, ${pm.longKm} km, ${pm.tipo}`);

    // Stitch all line strings into one continuous path
    const allPts = stitchLineStrings(pm.lineStrings);
    const kmlLen = (pathLength(allPts) / 1000).toFixed(1);

    console.log(`   Puntos: ${allPts.length}`);
    console.log(`   Long. calculada: ${kmlLen} km`);
    console.log(`   Rango: [${allPts[0][0].toFixed(5)},${allPts[0][1].toFixed(5)}] → [${allPts[allPts.length-1][0].toFixed(5)},${allPts[allPts.length-1][1].toFixed(5)}]`);

    features.push({
      type: "Feature",
      properties: {
        id: String(pm.id),
        routeId: ROUTE_ID,
        routeName: pm.name,
        direction: dir,
        color: ROUTE_COLOR,
        casingColor: CASING_COLOR,
        longKm: pm.longKm,
        transportType: pm.tipo,
        name: dir === "ida" ? "Ida" : "Vuelta",
      },
      geometry: {
        type: "LineString",
        coordinates: allPts,
      },
    });
  }

  const geojson = {
    type: "FeatureCollection",
    properties: { routeId: ROUTE_ID, routeName: ROUTE_NAME, color: ROUTE_COLOR, transportType: "Microbús" },
    features,
  };

  fs.writeFileSync(OUTPUT_GEOJSON, JSON.stringify(geojson, null, 2));
  console.log(`\n✅ GeoJSON: ${OUTPUT_GEOJSON}`);
  console.log(`   ${features.length} features, ${(JSON.stringify(geojson).length / 1024).toFixed(0)} KB`);

  // Write index
  const index = {
    type: "routes-index",
    routes: [{
      id: ROUTE_ID, name: ROUTE_NAME, color: ROUTE_COLOR,
      transportType: "Microbús", geojsonFile: "/routes/79.geojson",
    }],
  };
  fs.writeFileSync(OUTPUT_INDEX, JSON.stringify(index, null, 2));
  console.log(`📋 Index: ${OUTPUT_INDEX}`);
}

main();
