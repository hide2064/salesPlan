import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import pool from '../db';

const router = Router();

router.get('/', async (req: any, res: any) => {
  const { category_id, include_inactive } = req.query;
  let sql = `
    SELECT p.*, c.name AS category_name
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (category_id) { sql += ' AND p.category_id = ?'; params.push(category_id); }
  if (!include_inactive) { sql += ' AND p.is_active = 1'; }
  sql += ' ORDER BY c.sort_order, p.name';

  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

router.get('/:id', async (req: any, res: any) => {
  const [rows]: any = await pool.query(
    'SELECT p.*, c.name AS category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.id = ?',
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.post(
  '/',
  [
    body('category_id').isInt({ min: 1 }),
    body('name').notEmpty().trim().isLength({ max: 200 }),
    body('code').optional().trim().isLength({ max: 50 }),
    body('unit').optional().trim().isLength({ max: 20 }),
    body('default_cost_price').optional().isFloat({ min: 0 }),
    body('default_unit_price').optional().isFloat({ min: 0 }),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { category_id, name, code, unit, default_cost_price, default_unit_price } = req.body;
    try {
      const [result]: any = await pool.query(
        `INSERT INTO products (category_id, name, code, unit, default_cost_price, default_unit_price)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [category_id, name, code || null, unit || '個', default_cost_price ?? null, default_unit_price ?? null]
      );
      const [rows]: any = await pool.query(
        'SELECT p.*, c.name AS category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.id = ?',
        [result.insertId]
      );
      res.status(201).json(rows[0]);
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '製品コードが重複しています' });
      throw err;
    }
  }
);

router.put(
  '/:id',
  [
    body('category_id').optional().isInt({ min: 1 }),
    body('name').optional().trim().isLength({ max: 200 }),
    body('default_cost_price').optional().isFloat({ min: 0 }),
    body('default_unit_price').optional().isFloat({ min: 0 }),
    body('is_active').optional().isBoolean(),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const allowed = ['category_id', 'name', 'code', 'unit', 'default_cost_price', 'default_unit_price', 'is_active'];
    const fields: string[] = [];
    const values: any[] = [];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(key === 'is_active' ? (req.body[key] ? 1 : 0) : req.body[key]);
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: '更新フィールドがありません' });

    values.push(req.params.id);
    await pool.query(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows]: any = await pool.query(
      'SELECT p.*, c.name AS category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  }
);

router.delete('/:id', async (req: any, res: any) => {
  await pool.query('UPDATE products SET is_active = 0 WHERE id = ?', [req.params.id]);
  res.status(204).send();
});

// --- 価格改定履歴 ---

router.get('/:id/prices', async (req: any, res: any) => {
  const [rows] = await pool.query(
    'SELECT * FROM product_price_history WHERE product_id = ? ORDER BY valid_from DESC',
    [req.params.id]
  );
  res.json(rows);
});

router.post(
  '/:id/prices',
  [
    body('valid_from').isISO8601().toDate(),
    body('cost_price').optional().isFloat({ min: 0 }),
    body('unit_price').optional().isFloat({ min: 0 }),
    body('reason').optional().trim().isLength({ max: 500 }),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { valid_from, cost_price, unit_price, reason } = req.body;
    const [result]: any = await pool.query(
      `INSERT INTO product_price_history (product_id, valid_from, cost_price, unit_price, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, valid_from, cost_price ?? null, unit_price ?? null, reason ?? null]
    );

    // 製品マスタのデフォルト価格も更新
    const updates: string[] = [];
    const vals: any[] = [];
    if (cost_price !== undefined) { updates.push('default_cost_price = ?'); vals.push(cost_price); }
    if (unit_price !== undefined) { updates.push('default_unit_price = ?'); vals.push(unit_price); }
    if (updates.length > 0) {
      vals.push(req.params.id);
      await pool.query(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, vals);
    }

    const [rows]: any = await pool.query(
      'SELECT * FROM product_price_history WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  }
);

export default router;
