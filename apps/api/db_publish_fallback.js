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

// Read arguments
const argsFile = process.argv[2];
if (!argsFile) {
  console.error("Usage: node db_publish_fallback.js <path_to_args_json>");
  process.exit(1);
}

const argsData = JSON.parse(fs.readFileSync(argsFile, 'utf8'));
const {
  route_code,
  artifact_sha256,
  geometry,
  metrics,
  source_metadata,
  reviewer
} = argsData;

const client = new Client({
  connectionString: databaseUrl,
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to database for fallback publishing.");
    
    const query = `
      SELECT public.publish_validated_route_artifact(
        $1::text,
        $2::text,
        $3::jsonb,
        $4::jsonb,
        $5::jsonb,
        $6::text
      ) as run_id;
    `;
    const res = await client.query(query, [
      route_code,
      artifact_sha256,
      JSON.stringify(geometry),
      JSON.stringify(metrics),
      JSON.stringify(source_metadata),
      reviewer
    ]);
    
    console.log("Successfully published via database direct fallback! Run ID:", res.rows[0].run_id);
  } catch (err) {
    console.error("Error during fallback publishing:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
