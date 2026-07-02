const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.resolve(__dirname, './.env');
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

const manifestPath = path.resolve(__dirname, '../../tools/routes_manifest.csv');
if (!fs.existsSync(manifestPath)) {
  console.error(`Error: routes_manifest.csv not found at ${manifestPath}`);
  process.exit(1);
}

const client = new Client({
  connectionString: databaseUrl,
});

function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const headers = lines[0].split(',');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    // Simple CSV parser that handles potential quotes if any
    let row = [];
    let insideQuote = false;
    let entry = "";
    for (let char of lines[i]) {
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        row.push(entry);
        entry = "";
      } else {
        entry += char;
      }
    }
    row.push(entry);
    
    // Map headers to row values
    const obj = {};
    headers.forEach((h, index) => {
      obj[h.trim()] = row[index] ? row[index].trim() : "";
    });
    rows.push(obj);
  }
  return rows;
}

function mapTransportType(typeStr) {
  const lower = typeStr.toLowerCase();
  if (lower.includes('combi')) {
    return 'combi';
  }
  if (lower.includes('autobús') || lower.includes('bus') || lower.includes('camión') || lower.includes('microbús') || lower.includes('microbuc') || lower.includes('microbus')) {
    return 'bus';
  }
  return 'other';
}

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
    
    const csvContent = fs.readFileSync(manifestPath, 'utf8');
    const routes = parseCSV(csvContent);
    console.log(`Parsed ${routes.length} routes from CSV.`);
    
    for (const r of routes) {
      let code = r.route_id;
      const folder_name = r.folder_name;
      if (!code) {
        code = folder_name.includes("_") ? folder_name.split("_")[0] : folder_name.slice(0, 10);
      }
      
      const routeName = r.route_name || folder_name;
      let color = r.color_hex || "#FFC800";
      if (!color.startsWith("#")) {
        color = "#FFC800";
      }
      const type = mapTransportType(r.transport_type);
      
      console.log(`Seeding route ${code}: ${routeName} (Type: ${type}, Color: ${color})`);
      await client.query(`
        insert into public.routes (city_id, source_id, code, name, public_name, color, transport_type, validation_status, is_active)
        values ($1, $2, $3, $4, $4, $5, $6, 'validated', true)
        on conflict (city_id, code) do update set 
          name = excluded.name, 
          public_name = excluded.public_name,
          color = excluded.color, 
          transport_type = excluded.transport_type, 
          is_active = true
      `, [cityId, sourceId, code, routeName, color, type]);
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
