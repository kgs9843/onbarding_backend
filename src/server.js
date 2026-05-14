import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';

import { createPool, ensureTodosTable } from './db.js';
import { createTodoStore } from './todoStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

dotenv.config({ path: path.join(rootDir, 'local.env') });

const PORT = Number(process.env.PORT) || 3002;
const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const API_BASE_PATH = (process.env.API_BASE_PATH || '/api').replace(/\/$/, '');

const pool = createPool();
const store = createTodoStore(pool);
const app = express();

app.use(
  cors({
    origin: CORS_ORIGINS.length === 1 ? CORS_ORIGINS[0] : CORS_ORIGINS,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);
app.use(express.json());

app.get(`${API_BASE_PATH}/todos`, async (_req, res) => {
  try {
    const todos = await store.list();
    res.json(todos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '할 일 목록을 불러오지 못했습니다.' });
  }
});

app.post(`${API_BASE_PATH}/todos`, async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    res.status(400).json({ error: 'text는 필수이며 비어 있을 수 없습니다.' });
    return;
  }
  try {
    const todo = await store.create(text);
    res.status(201).json(todo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '할 일을 추가하지 못했습니다.' });
  }
});

app.patch(`${API_BASE_PATH}/todos/:id/complete`, async (req, res) => {
  try {
    const updated = await store.complete(req.params.id);
    if (!updated) {
      res.status(404).json({ error: '해당 할 일을 찾을 수 없습니다.' });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '완료 처리에 실패했습니다.' });
  }
});

app.delete(`${API_BASE_PATH}/todos/:id`, async (req, res) => {
  try {
    const removed = await store.remove(req.params.id);
    if (!removed) {
      res.status(404).json({ error: '해당 할 일을 찾을 수 없습니다.' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '삭제에 실패했습니다.' });
  }
});

async function main() {
  await ensureTodosTable(pool);
  app.listen(PORT, () => {
    console.log(`Todo API listening on http://localhost:${PORT}${API_BASE_PATH}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
