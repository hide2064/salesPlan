import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import pool from '../db';

const router = Router();

router.get('/', async (_req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM categories ORDER BY sort_order, id'
  );
  res.json(rows);
});

router.post(
  '/',
  [
    body('name').notEmpty().trim().isLength({ max: 100 }),
    body('sort_order').optional().isInt({ min: 0 }),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, sort_order = 0 } = req.body;
    try {
      const [result]: any = await pool.query(
        'INSERT INTO categories (name, sort_order) VALUES (?, ?)',
        [name, sort_order]
      );
      const [rows]: any = await pool.query('SELECT * FROM categories WHERE id = ?', [result.insertId]);
      res.status(201).json(rows[0]);
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'カテゴリ名が重複しています' });
      throw err;
    }
  }
);

router.put(
  '/:id',
  [
    body('name').optional().trim().isLength({ max: 100 }),
    body('sort_order').optional().isInt({ min: 0 }),
    body('is_active').optional().isBoolean(),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, sort_order, is_active } = req.body;
    const fields: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
    if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active ? 1 : 0); }

    if (fields.length === 0) return res.status(400).json({ error: '更新フィールドがありません' });

    values.push(req.params.id);
    await pool.query(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows]: any = await pool.query('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  }
);

router.delete('/:id', async (req: any, res: any) => {
  await pool.query('UPDATE categories SET is_active = 0 WHERE id = ?', [req.params.id]);
  res.status(204).send();
});

export default router;
