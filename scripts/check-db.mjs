/**
 * DB 연결 검증: createPool → SELECT 1 → todos 테이블 존재 확인
 * 사용: backend 폴더에서 `npm run test:db`
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { createPool, ensureTodosTable } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
dotenv.config({ path: path.join(rootDir, 'local.env') });

async function main() {
  console.log('DB 연결 시도…');
  const pool = await createPool();
  const r = await pool.query('SELECT 1 AS ok');
  console.log('SELECT 1 →', r.rows[0]);

  await ensureTodosTable(pool);
  const t = await pool.query(
    "SELECT to_regclass('public.todos') AS todos_table",
  );
  console.log('todos 테이블 →', t.rows[0]?.todos_table ?? '(없음)');

  await pool.end();
  console.log('OK: DB 연결 및 스키마 확인 완료');
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
