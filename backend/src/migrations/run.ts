import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS _migrations (name VARCHAR(256) PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT NOW())`);
    const dir = __dirname;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      const { rows } = await client.query('SELECT name FROM _migrations WHERE name=$1', [file]);
      if (rows.length) { console.log(`Skip: ${file}`); continue; }
      console.log(`Running: ${file}`);
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO _migrations(name) VALUES($1)', [file]);
      console.log(`Done: ${file}`);
    }
    console.log('All migrations complete!');
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch(e => { console.error(e); process.exit(1); });
