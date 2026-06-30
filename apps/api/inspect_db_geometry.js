const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, './.env');
const envText = fs.readFileSync(envPath, 'utf8');
const dbUrlMatch = envText.match(/^DATABASE_URL\s*=\s*(.+)$/m);
const databaseUrl = dbUrlMatch[1].trim();

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  
  // Find the max ID of route variants to see what was recently inserted
  const maxRes = await client.query(`
    select max(id) as max_id from public.route_variants
  `);
  const maxId = maxRes.rows[0].max_id;
  console.log(`Max variant ID is ${maxId}`);
  
  // Fetch geometries of the 2 most recent variants
  const res = await client.query(`
    select id, name, direction, extensions.st_asgeojson(geometry)::jsonb as geojson
    from public.route_variants
    where id in (${maxId}, ${maxId - 1})
    order by id desc
  `);
  
  for (const row of res.rows) {
    const coords = row.geojson.coordinates;
    console.log(`\nVariant ID ${row.id} (${row.name}, Direction ${row.direction}) has ${coords.length} coordinates.`);
    
    // Find segments near the region (-101.212, 19.746)
    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = coords[i];
      const p2 = coords[i+1];
      const dx = (p2[0] - p1[0]) * 111300 * Math.cos(19.75 * Math.PI / 180);
      const dy = (p2[1] - p1[1]) * 111000;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      if (Math.abs(p1[0] - (-101.212)) < 0.005 && Math.abs(p1[1] - 19.746) < 0.005) {
        console.log(`  Index ${i}: ${JSON.stringify(p1)} -> ${JSON.stringify(p2)} | Dist: ${dist.toFixed(1)}m`);
      }
    }
  }
  
  await client.end();
}

main().catch(console.error);
