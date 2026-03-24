import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import pool from '../db';

const router = Router();

router.get('/', async (req: any, res: any) => {
  const { year_month, from, to } = req.query;
  let sql = `
    SELECT f.*, c.name AS category_name,
           ROUND(f.forecast_amount * (1 - IFNULL(f.forecast_cost_rate, 0)), 2) AS forecast_profit
    FROM forecasts f
    JOIN categories c ON f.category_id = c.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (year_month) { sql += ' AND f.year_month = ?'; params.push(year_month); }
  if (from) { sql += ' AND f.year_month >= ?'; params.push(from); }
  if (to) { sql += ' AND f.year_month <= ?'; params.push(to); }
  sql += ' ORDER BY f.year_month, c.sort_order';

  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

router.post(
  '/',
  [
    body('year_month').matches(/^\d{4}-\d{2}$/),
    body('category_id').isInt({ min: 1 }),
    body('forecast_amount').isFloat({ min: 0 }),
    body('forecast_cost_rate').optional({ nullable: true }).isFloat({ min: 0, max: 1 }),
    body('notes').optional().trim(),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { year_month, category_id, forecast_amount, forecast_cost_rate, notes } = req.body;
    const year = parseInt(year_month.substring(0, 4));
    const month = parseInt(year_month.substring(5, 7));

    // upsert
    const [result]: any = await pool.query(
      `INSERT INTO forecasts (year_month, year, month, category_id, forecast_amount, forecast_cost_rate, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         forecast_amount    = VALUES(forecast_amount),
         forecast_cost_rate = VALUES(forecast_cost_rate),
         notes              = VALUES(notes)`,
      [year_month, year, month, category_id, forecast_amount, forecast_cost_rate ?? null, notes ?? null]
    );

    const id = result.insertId || result.insertId;
    const [rows]: any = await pool.query(
      `SELECT f.*, c.name AS category_name FROM forecasts f
       JOIN categories c ON f.category_id = c.id
       WHERE f.year_month = ? AND f.category_id = ?`,
      [year_month, category_id]
    );
    res.status(201).json(rows[0]);
  }
);

router.put(
  '/:id',
  [
    body('forecast_amount').optional().isFloat({ min: 0 }),
    body('forecast_cost_rate').optional({ nullable: true }).isFloat({ min: 0, max: 1 }),
    body('notes').optional().trim(),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const allowed = ['forecast_amount', 'forecast_cost_rate', 'notes'];
    const fields: string[] = [];
    const values: any[] = [];

    for (const key of allowed) {
      if (req.body[key] !== undefined) { fields.push(`${key} = ?`); values.push(req.body[key]); }
    }
    if (fields.length === 0) return res.status(400).json({ error: '更新フィールドがありません' });

    values.push(req.params.id);
    await pool.query(`UPDATE forecasts SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows]: any = await pool.query(
      'SELECT f.*, c.name AS category_name FROM forecasts f JOIN categories c ON f.category_id = c.id WHERE f.id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  }
);

router.delete('/:id', async (req: any, res: any) => {
  const [result]: any = await pool.query('DELETE FROM forecasts WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

export default router;
