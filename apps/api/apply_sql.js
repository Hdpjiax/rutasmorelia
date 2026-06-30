const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// 1. Load env variables from .env
const envPath = path.resolve(__dirname, './.env');
if (!fs.existsSync(envPath)) {
  console.error(`Error: Config file not found at ${envPath}`);
  process.exit(1);
}

const envText = fs.readFileSync(envPath, 'utf8');
const dbUrlMatch = envText.match(/^DATABASE_URL\s*=\s*(.+)$/m);
if (!dbUrlMatch) {
  console.error("Error: DATABASE_URL not found in .env");
  process.exit(1);
}

const databaseUrl = dbUrlMatch[1].trim();

// 2. Read the SQL file from command line arguments
const sqlFilePath = process.argv[2];
if (!sqlFilePath) {
  console.error("Usage: node apply_sql.js <path_to_sql_file>");
  process.exit(1);
}

const resolvedSqlPath = path.resolve(sqlFilePath);
if (!fs.existsSync(resolvedSqlPath)) {
  console.error(`Error: SQL file not found at ${resolvedSqlPath}`);
  process.exit(1);
}

const sqlText = fs.readFileSync(resolvedSqlPath, 'utf8');

// 3. Connect and execute
console.log(`Connecting to database...`);
const client = new Client({
  connectionString: databaseUrl,
});

async function run() {
  try {
    await client.connect();
    console.log(`Successfully connected.`);
    console.log(`Executing SQL transaction from ${path.basename(resolvedSqlPath)}...`);
    
    await client.query(sqlText);
    
    console.log(`SQL transaction executed and committed successfully!`);
  } catch (err) {
    console.error(`Database Error during execution:`, err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
