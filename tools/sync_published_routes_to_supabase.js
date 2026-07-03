const fs = require('fs');
const path = require('path');
const {Client} = require('../apps/api/node_modules/pg');

const ROOT = path.resolve(__dirname, '..');
const ROUTE_CODES = new Set(process.argv.slice(2));

function databaseUrl() {
  const env = fs.readFileSync(path.join(ROOT, 'apps', 'api', '.env'), 'utf8');
  const match = env.match(/^DATABASE_URL\s*=\s*(.+)$/m);
  if (!match) throw new Error('DATABASE_URL no está definida en apps/api/.env');
  return match[1].trim();
}

async function main() {
  if (!ROUTE_CODES.size) throw new Error('Indique al menos un código de ruta');
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', 'web', 'public', 'routes', 'index.json'), 'utf8'));
  const routes = index.routes.filter(route => ROUTE_CODES.has(String(route.id)));
  if (routes.length !== ROUTE_CODES.size) throw new Error('Uno o más códigos no existen en routes/index.json');

  const client = new Client({connectionString: databaseUrl()});
  await client.connect();
  try {
    await client.query('begin');
    const city = await client.query("select id from public.cities where name='Morelia' order by id limit 1");
    if (!city.rowCount) throw new Error('No existe la ciudad Morelia');

    for (const route of routes) {
      const code = String(route.id);
      const transportType = route.transportType === 'Combi' ? 'combi' : 'bus';
      const upsert = await client.query(`
        insert into public.routes (city_id,code,name,public_name,color,transport_type,is_active,validation_status,metadata)
        values ($1,$2,$3,$3,$4,$5,true,'validated',jsonb_build_object('published_index',true))
        on conflict (city_id,code) do update set
          name=excluded.name, public_name=excluded.public_name, color=excluded.color,
          transport_type=excluded.transport_type, is_active=true, validation_status='validated', updated_at=now()
        returning id
      `, [city.rows[0].id, code, route.name, route.color, transportType]);
      const routeId = upsert.rows[0].id;
      const geojson = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', 'web', 'public', 'routes', `${code}.geojson`), 'utf8'));

      await client.query('delete from public.route_variants where route_id=$1', [routeId]);
      for (let index = 0; index < geojson.features.length; index += 1) {
        const feature = geojson.features[index];
        const direction = Math.max(0, Math.min(1, Number(feature.properties?.directionIndex ?? index + 1) - 1));
        await client.query(`
          insert into public.route_variants
            (route_id,name,direction,geometry,is_primary,is_active,alignment_metadata,alignment_updated_at)
          values ($1,$2,$3,extensions.st_setsrid(extensions.st_geomfromgeojson($4),4326),$5,true,$6::jsonb,now())
        `, [routeId, feature.properties?.name || `Dirección ${direction + 1}`, direction,
          JSON.stringify(feature.geometry), direction === 0,
          JSON.stringify({artifact_sha256: route.artifactSha256, source: 'published_web_geojson'})]);
      }
      console.log(`${code}: ${geojson.features.length} variante(s)`);
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
