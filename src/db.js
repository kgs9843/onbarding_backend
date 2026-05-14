import pg from 'pg';

function buildPoolConfig() {
  const sslDisabled = process.env.PGSSLMODE === 'disable';
  /** RDS TLS — 운영에서는 RDS CA 번들로 rejectUnauthorized: true 권장 */
  const ssl = sslDisabled ? false : { rejectUnauthorized: false };

  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, ssl };
  }

  const host = process.env.PGHOST;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE;
  if (!host || !user || !database || password == null || String(password) === '') {
    throw new Error(
      'DB 설정이 없습니다. DATABASE_URL 또는 PGHOST, PGUSER, PGPASSWORD(비어 있지 않게), PGDATABASE를 local.env에 설정하세요.',
    );
  }

  return {
    host,
    port: Number(process.env.PGPORT || 5432),
    user,
    password,
    database,
    ssl,
  };
}

export function createPool() {
  return new pg.Pool({ ...buildPoolConfig(), max: 10, idleTimeoutMillis: 30_000 });
}

export async function ensureTodosTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      text TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT false
    );
  `);
}
