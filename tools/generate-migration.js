#!/usr/bin/env node
/**
 * Generate Supabase migration SQL from GeoJSON route data.
 * Creates route + route_variants entries with PostGIS geometry.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const GEOJSON = path.resolve(__dirname, "../apps/web/public/routes/79.geojson");
const OUTPUT = path.resolve(__dirname, "../supabase/migrations/20260630000100_insert_route_79_alberca_gertrudis.sql");

const data = JSON.parse(fs.readFileSync(GEOJSON, "utf-8"));

let migration = `-- Migration: Insert route 79 - Alberca (Gertrudis)
-- Generated from KML at ${new Date().toISOString()}
-- This is the official route tracing with exact KML coordinates.

BEGIN;

DO $migrate$
DECLARE
  v_city_id bigint;
  v_route_id bigint;
BEGIN
  -- Ensure Morelia exists
  INSERT INTO public.cities (name, state, country_code)
  VALUES ('Morelia', 'Michoac\u00e1n', 'MX')
  ON CONFLICT (name, state, country_code) DO NOTHING;

  SELECT id INTO v_city_id FROM public.cities WHERE name = 'Morelia' AND state = 'Michoac\u00e1n';

  -- Ensure OSM data source exists
  INSERT INTO public.data_sources (name, source_type, publisher, validation_status)
  VALUES ('OpenStreetMap Morelia', 'openstreetmap', 'OpenStreetMap contributors', 'validated')
  ON CONFLICT DO NOTHING;

  -- Upsert route
  INSERT INTO public.routes (city_id, code, name, public_name, color, transport_type, is_active, validation_status)
  VALUES (v_city_id, '79', 'Alberca (Gertrudis)', 'Alberca Gertrudis', '#FFC800', 'combi', true, 'validated')
  ON CONFLICT (city_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    public_name = EXCLUDED.public_name,
    color = EXCLUDED.color,
    transport_type = EXCLUDED.transport_type,
    is_active = true,
    validation_status = 'validated'
  RETURNING id INTO v_route_id;

  -- Clean old variants
  DELETE FROM public.route_variants WHERE route_id = v_route_id;

`;

data.features.forEach((f, i) => {
  const dirName = f.properties.name;
  const direction = i === 0 ? 0 : 1;
  const wkt = f.geometry.coordinates.map(c => `${c[0]} ${c[1]}`).join(", ");
  const distM = f.properties.longKm ? Math.round(parseFloat(f.properties.longKm) * 1000) : 0;

  migration += `  -- ${dirName} (${f.properties.direction})
  INSERT INTO public.route_variants (route_id, name, direction, geometry, distance_meters, is_primary, is_active)
  VALUES (v_route_id, '${dirName}', ${direction},
    ST_GeomFromText('LINESTRING(${wkt})', 4326),
    ${distM}, ${i === 0 ? "true" : "false"}, true);

`;
});

migration += `END $migrate$;

COMMIT;
`;

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, migration);
console.log("Migration written:", OUTPUT);
console.log("Size:", (migration.length / 1024).toFixed(1), "KB");
