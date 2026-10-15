import pg from 'pg';
import { config } from './env.js';

const { Pool } = pg;

let pool = null;
let isConnected = false;

if (config.databaseUrl) {
  pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
  });

  pool.on('error', (err) => {
    console.error('[Database Pool Error]:', err.message);
  });
}

export async function checkDatabaseConnection() {
  if (!pool) {
    return { connected: false, message: 'Database URL not configured. Using in-memory repository store.' };
  }

  try {
    const client = await pool.connect();
    const res = await client.query('SELECT NOW()');
    client.release();
    isConnected = true;
    return { connected: true, timestamp: res.rows[0].now };
  } catch (err) {
    isConnected = false;
    return { connected: false, error: err.message };
  }
}

export { pool, isConnected };
