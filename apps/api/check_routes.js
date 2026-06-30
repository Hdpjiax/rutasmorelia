const { Client } = require('pg');
const connectionString = "postgresql://postgres.vmsjcqesmlkagcjqpsso:Domelita0910%40@aws-1-us-east-2.pooler.supabase.com:6543/postgres?sslmode=no-verify";

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  console.log("Connected to database.");
  
  const routes = await client.query("select id, code, name, transport_type, is_active from public.routes");
  console.log(`\nFound ${routes.rows.length} routes:`);
  for (const r of routes.rows) {
    console.log(`ID: ${r.id} | Code: ${r.code} | Name: ${r.name} | Type: ${r.transport_type} | Active: ${r.is_active}`);
  }
  
  const variants = await client.query("select id, route_id, name, direction, is_active, is_primary from public.route_variants");
  console.log(`\nFound ${variants.rows.length} route variants:`);
  for (const v of variants.rows) {
    console.log(`ID: ${v.id} | RouteID: ${v.route_id} | Name: ${v.name} | Direction: ${v.direction} | Active: ${v.is_active} | Primary: ${v.is_primary}`);
  }
  
  await client.end();
}

run().catch(console.error);
