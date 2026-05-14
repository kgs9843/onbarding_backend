import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import pg from 'pg';

function sslOption() {
  const sslDisabled = process.env.PGSSLMODE === 'disable';
  return sslDisabled ? false : { rejectUnauthorized: false };
}

/**
 * RDS가 Secrets Manager에 저장한 JSON (host, username, password, port, dbname 등)
 * @returns {Promise<object>} pg.Pool 생성 옵션 (connectionString 제외, 개별 필드)
 */
async function loadPoolConfigFromSecretsManager(ssl) {
  const arn = process.env.RDS_SECRET_ARN?.trim();
  if (!arn) return null;

  const region =
    process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim() || 'ap-northeast-2';
  const client = new SecretsManagerClient({ region });
  const out = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  if (!out.SecretString) {
    throw new Error('Secrets Manager 응답에 SecretString이 없습니다.');
  }
  const s = JSON.parse(out.SecretString);
  const host = s.host;
  const user = s.username;
  const password = s.password;
  const database = s.dbname ?? s.database ?? s.dbName;
  const port = Number(s.port ?? 5432);
  if (!host || !user || !password || !database) {
    throw new Error(
      '시크릿 JSON에 host, username, password, dbname(또는 database)이 있어야 합니다. RDS가 만든 시크릿 형식을 확인하세요.',
    );
  }
  return { host, port, user, password, database, ssl };
}

function buildPoolConfigFromEnv(ssl) {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, ssl };
  }

  const host = process.env.PGHOST;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE;
  if (!host || !user || !database || password == null || String(password) === '') {
    throw new Error(
      'DB 설정이 없습니다. RDS_SECRET_ARN을 쓰거나, DATABASE_URL 또는 PGHOST·PGUSER·PGPASSWORD·PGDATABASE를 local.env에 설정하세요.',
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

/** Secrets Manager → 없으면 env 기반 연결 */
export async function createPool() {
  const ssl = sslOption();
  const fromSm = await loadPoolConfigFromSecretsManager(ssl);
  const config = fromSm ?? buildPoolConfigFromEnv(ssl);
  return new pg.Pool({ ...config, max: 10, idleTimeoutMillis: 30_000 });
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
