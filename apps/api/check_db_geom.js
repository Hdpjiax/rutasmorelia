const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envText = fs.readFileSync(path.resolve(__dirname, './.env'), 'utf8');
const dbUrl = envText.match(/^DATABASE_URL\s*=\s*(.+)$/m)[1].trim();

const client = new Client({ connectionString: dbUrl });

async function run() {
  await client.connect();
  console.log("Connected to database. Fetching geometries...");
  
  const res = await client.query(`
    select id, route_id, name, ST_GeometryType(geometry) as geom_type, ST_NumGeometries(geometry) as num_parts
    from public.route_variants
    where id in (4, 5, 6, 7, 18, 258)
  `);
  
  for (const row of res.rows) {
    console.log(`ID: ${row.id} | RouteID: ${row.route_id} | Name: ${row.name} | Type: ${row.geom_type} | Parts: ${row.num_parts || 1}`);
  }
  
  await client.end();
}

run().catch(console.error);
