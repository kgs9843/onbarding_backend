/**
 * PostgreSQL(RDS)에 할 일을 저장합니다.
 * @param {import('pg').Pool} pool
 */
export function createTodoStore(pool) {
  return {
    async list() {
      const { rows } = await pool.query(
        'SELECT id, text, completed FROM todos ORDER BY id ASC',
      );
      return rows.map((r) => ({
        id: Number(r.id),
        text: String(r.text),
        completed: Boolean(r.completed),
      }));
    },

    async create(text) {
      const { rows } = await pool.query(
        'INSERT INTO todos (text, completed) VALUES ($1, false) RETURNING id, text, completed',
        [text],
      );
      const r = rows[0];
      return {
        id: Number(r.id),
        text: String(r.text),
        completed: Boolean(r.completed),
      };
    },

    async complete(id) {
      const numericId = Number(id);
      const sel = await pool.query(
        'SELECT id, text, completed FROM todos WHERE id = $1',
        [numericId],
      );
      if (sel.rowCount === 0) return null;
      const row = sel.rows[0];
      if (row.completed) {
        return {
          id: Number(row.id),
          text: String(row.text),
          completed: true,
        };
      }
      const { rows } = await pool.query(
        'UPDATE todos SET completed = true WHERE id = $1 RETURNING id, text, completed',
        [numericId],
      );
      const r = rows[0];
      return {
        id: Number(r.id),
        text: String(r.text),
        completed: Boolean(r.completed),
      };
    },

    async remove(id) {
      const { rowCount } = await pool.query('DELETE FROM todos WHERE id = $1', [Number(id)]);
      return rowCount > 0;
    },
  };
}
