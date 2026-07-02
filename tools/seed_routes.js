const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.resolve(__dirname, '../apps/api/.env');
if (!fs.existsSync(envPath)) {
  console.error(`Error: .env not found at ${envPath}`);
  process.exit(1);
}

const envText = fs.readFileSync(envPath, 'utf8');
const dbUrlMatch = envText.match(/^DATABASE_URL\s*=\s*(.+)$/m);
if (!dbUrlMatch) {
  console.error("Error: DATABASE_URL not found in .env");
  process.exit(1);
}
const databaseUrl = dbUrlMatch[1].trim();

const client = new Client({
  connectionString: databaseUrl,
});

const routesToSeed = [
  { code: '2', name: 'Amarilla Tenencia Morelos', color: '#FFC800', type: 'combi' },
  { code: '3', name: 'Amarilla 1 Centro', color: '#FFC800', type: 'combi' },
  { code: '4', name: 'Amarilla 2', color: '#FFC800', type: 'combi' },
  { code: '5', name: 'Azul A Soriana-CBTA', color: '#004E98', type: 'combi' },
  { code: '78', name: 'Alberca (Metropolis)', color: '#FFC800', type: 'combi' }
];

async function run() {
  try {
    await client.connect();
    console.log("Connected to database for seeding.");
    
    // Get city_id and source_id
    const cityRes = await client.query("select id from public.cities where name = 'Morelia' limit 1");
    if (cityRes.rows.length === 0) {
      throw new Error("City 'Morelia' not found in public.cities");
    }
    const cityId = cityRes.rows[0].id;
    
    const sourceRes = await client.query("select id from public.data_sources where name = 'OpenStreetMap Morelia' limit 1");
    if (sourceRes.rows.length === 0) {
      throw new Error("Data source 'OpenStreetMap Morelia' not found in public.data_sources");
    }
    const sourceId = sourceRes.rows[0].id;
    
    for (const r of routesToSeed) {
      console.log(`Seeding route ${r.code}: ${r.name}`);
      await client.query(`
        insert into public.routes (city_id, source_id, code, name, public_name, color, transport_type, validation_status, is_active)
        values ($1, $2, $3, $4, $4, $5, $6, 'validated', true)
        on conflict (code) do update set 
          name = excluded.name, 
          public_name = excluded.public_name,
          color = excluded.color, 
          transport_type = excluded.transport_type, 
          is_active = true
      `, [cityId, sourceId, r.code, r.name, r.color, r.type]);
    }
    console.log("Seeding routes completed successfully!");
  } catch (err) {
    console.error("Error during seeding:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
