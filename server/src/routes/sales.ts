import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import pool from '../db';

const router = Router();

function toYearMonth(date: string): string {
  return date.substring(0, 7); // "2026-03-15" → "2026-03"
}

router.get('/', async (req: any, res: any) => {
  const { year_month, category_id, product_id, customer_name, page = '1', limit = '50' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let sql = `
    SELECT s.*,
           c.name  AS category_name,
           p.name  AS product_name,
           p.unit  AS product_unit,
           (s.amount - IFNULL(s.cost_amount, 0)) AS profit_amount,
           CASE WHEN s.amount > 0 THEN ROUND((s.amount - IFNULL(s.cost_amount, 0)) / s.amount * 100, 2) ELSE NULL END AS profit_rate
    FROM sales s
    JOIN categories c ON s.category_id = c.id
    LEFT JOIN products p ON s.product_id = p.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (year_month) { sql += ' AND s.year_month = ?'; params.push(year_month); }
  if (category_id) { sql += ' AND s.category_id = ?'; params.push(category_id); }
  if (product_id) { sql += ' AND s.product_id = ?'; params.push(product_id); }
  if (customer_name) { sql += ' AND s.customer_name LIKE ?'; params.push(`%${customer_name}%`); }

  // count
  const [countRows]: any = await pool.query(
    `SELECT COUNT(*) AS total FROM sales s WHERE 1=1${
      year_month ? ' AND s.year_month = ?' : ''}${
      category_id ? ' AND s.category_id = ?' : ''}${
      product_id ? ' AND s.product_id = ?' : ''}${
      customer_name ? ' AND s.customer_name LIKE ?' : ''}`,
    params
  );
  const total = countRows[0].total;

  sql += ' ORDER BY s.sale_date DESC, s.id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);

  const [rows] = await pool.query(sql, params);
  res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
});

router.post(
  '/',
  [
    body('sale_date').isISO8601(),
    body('category_id').isInt({ min: 1 }),
    body('product_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('quantity').isFloat({ min: 0 }),
    body('unit_price').isFloat({ min: 0 }),
    body('cost_price').optional({ nullable: true }).isFloat({ min: 0 }),
    body('amount').isFloat({ min: 0 }),
    body('cost_amount').optional({ nullable: true }).isFloat({ min: 0 }),
    body('customer_name').optional().trim().isLength({ max: 200 }),
    body('description').optional().trim(),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { sale_date, category_id, product_id, quantity, unit_price, cost_price,
            amount, cost_amount, customer_name, description } = req.body;
    const ym = toYearMonth(sale_date);
    const year = parseInt(ym.substring(0, 4));
    const month = parseInt(ym.substring(5, 7));

    const [result]: any = await pool.query(
      `INSERT INTO sales
       (sale_date, year, month, year_month, category_id, product_id, quantity,
        unit_price, cost_price, amount, cost_amount, customer_name, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sale_date, year, month, ym, category_id, product_id ?? null, quantity,
       unit_price, cost_price ?? null, amount, cost_amount ?? null,
       customer_name ?? null, description ?? null]
    );
    const [rows]: any = await pool.query(
      `SELECT s.*, c.name AS category_name, p.name AS product_name,
              (s.amount - IFNULL(s.cost_amount,0)) AS profit_amount
       FROM sales s
       JOIN categories c ON s.category_id = c.id
       LEFT JOIN products p ON s.product_id = p.id
       WHERE s.id = ?`,
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  }
);

router.put(
  '/:id',
  [
    body('sale_date').optional().isISO8601(),
    body('quantity').optional().isFloat({ min: 0 }),
    body('unit_price').optional().isFloat({ min: 0 }),
    body('cost_price').optional({ nullable: true }).isFloat({ min: 0 }),
    body('amount').optional().isFloat({ min: 0 }),
    body('cost_amount').optional({ nullable: true }).isFloat({ min: 0 }),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const allowed = ['category_id', 'product_id', 'quantity', 'unit_price', 'cost_price',
                     'amount', 'cost_amount', 'customer_name', 'description'];
    const fields: string[] = [];
    const values: any[] = [];

    if (req.body.sale_date) {
      const ym = toYearMonth(req.body.sale_date);
      fields.push('sale_date = ?', 'year = ?', 'month = ?', 'year_month = ?');
      values.push(req.body.sale_date, parseInt(ym.substring(0, 4)), parseInt(ym.substring(5, 7)), ym);
    }
    for (const key of allowed) {
      if (req.body[key] !== undefined) { fields.push(`${key} = ?`); values.push(req.body[key]); }
    }
    if (fields.length === 0) return res.status(400).json({ error: '更新フィールドがありません' });

    values.push(req.params.id);
    await pool.query(`UPDATE sales SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows]: any = await pool.query(
      `SELECT s.*, c.name AS category_name, p.name AS product_name,
              (s.amount - IFNULL(s.cost_amount,0)) AS profit_amount
       FROM sales s
       JOIN categories c ON s.category_id = c.id
       LEFT JOIN products p ON s.product_id = p.id
       WHERE s.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  }
);

router.delete('/:id', async (req: any, res: any) => {
  const [result]: any = await pool.query('DELETE FROM sales WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

export default router;
