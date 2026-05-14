import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import pg from 'pg';

function sslOption() {
  const sslDisabled = process.env.PGSSLMODE === 'disable';
  return sslDisabled ? false : { rejectUnauthorized: false };
}

/**
 * RDS / Secrets Manager에 흔한 JSON 키 변형을 허용합니다.
 * @param {Record<string, unknown>} s
 */
function parseSecretForPostgres(s) {
  const host =
    pickStr(s, ['host', 'hostname', 'address', 'endpoint', 'HOST']) ||
    (typeof s.endpoint === 'string' ? s.endpoint.replace(/:\d+$/, '') : '') ||
    process.env.PGHOST?.trim();
  const user = pickStr(s, ['username', 'user', 'USER', 'USERNAME']);
  const password = pickStr(s, ['password', 'PASSWORD', 'token']);
  const database =
    pickStr(s, ['dbname', 'database', 'dbName', 'name', 'DBNAME']) ||
    process.env.PGDATABASE?.trim() ||
    'postgres';
  const port = pickPort(s);

  return { host, user, password, database, port, rawKeys: Object.keys(s) };
}

function pickStr(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

function pickPort(obj) {
  const p = obj.port ?? obj.PORT;
  if (typeof p === 'number' && Number.isFinite(p)) return p;
  if (typeof p === 'string' && p.length > 0) return Number(p) || 5432;
  return 5432;
}

/**
 * RDS가 Secrets Manager에 저장한 JSON
 * @returns {Promise<object>} pg.Pool 생성 옵션 (connectionString 제외, 개별 필드)
 */
async function loadPoolConfigFromSecretsManager(ssl) {
  const arn = process.env.RDS_SECRET_ARN?.trim();
  if (!arn) return null;

  const region =
    process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim() || 'ap-northeast-2';
  const client = new SecretsManagerClient({ region });
  const out = await client.send(
    new GetSecretValueCommand({
      SecretId: arn,
      VersionStage: 'AWSCURRENT',
    }),
  );
  if (!out.SecretString) {
    throw new Error('Secrets Manager 응답에 SecretString이 없습니다.');
  }

  let s;
  try {
    s = JSON.parse(out.SecretString);
  } catch {
    throw new Error(
      '시크릿이 JSON이 아닙니다. RDS가 자동 생성한 시크릿인지, Secrets Manager 콘솔에서 "시크릿 값" 형식을 확인하세요.',
    );
  }

  const parsed = parseSecretForPostgres(s);
  const { host, user, password, database, port, rawKeys } = parsed;

  if (!host || !user || !password) {
    throw new Error(
      `시크릿에서 host·username·password를 찾지 못했습니다. (시크릿에 있는 키: ${rawKeys.join(', ')}) ` +
        `RDS 콘솔에서 해당 시크릿 "값 보기"로 JSON 키를 확인하거나, local.env에 PGHOST를 함께 두면 host를 보완할 수 있습니다.`,
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
