import { Router } from 'express';
import pool from '../db';

const router = Router();

function toYearMonth(date: string): string {
  return date.substring(0, 7);
}

function parseNum(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

/**
 * POST /api/import/sales
 * Body: { rows: Array<CSVRow> }
 * CSVRow: { sale_date, category_name, product_name?, quantity, unit_price, cost_price?,
 *            amount, cost_amount?, customer_name?, description? }
 */
router.post('/sales', async (req: any, res: any) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows が空です' });
  }
  if (rows.length > 1000) {
    return res.status(400).json({ error: '一度に取り込めるのは1000件までです' });
  }

  // カテゴリ・製品をキャッシュ
  const [cats]: any = await pool.query('SELECT id, name FROM categories WHERE is_active = 1');
  const [prods]: any = await pool.query('SELECT id, name, category_id FROM products WHERE is_active = 1');
  const catMap: Record<string, number> = {};
  const prodMap: Record<string, number> = {};
  for (const c of cats) catMap[c.name] = c.id;
  for (const p of prods) prodMap[p.name] = p.id;

  const errors: { row: number; message: string }[] = [];
  const inserts: any[][] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2; // 1-indexed + header row

    if (!r.sale_date || !r.sale_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      errors.push({ row: rowNum, message: 'sale_date が不正（YYYY-MM-DD 形式）' });
      continue;
    }
    if (!r.category_name) {
      errors.push({ row: rowNum, message: 'category_name が空' });
      continue;
    }
    const categoryId = catMap[r.category_name];
    if (!categoryId) {
      errors.push({ row: rowNum, message: `カテゴリ "${r.category_name}" が見つかりません` });
      continue;
    }
    const productId = r.product_name ? (prodMap[r.product_name] ?? null) : null;
    if (r.product_name && !productId) {
      errors.push({ row: rowNum, message: `製品 "${r.product_name}" が見つかりません` });
      continue;
    }

    const quantity = parseNum(r.quantity);
    const unitPrice = parseNum(r.unit_price);
    const amount = parseNum(r.amount);

    if (quantity === null || quantity < 0) { errors.push({ row: rowNum, message: 'quantity が不正' }); continue; }
    if (unitPrice === null || unitPrice < 0) { errors.push({ row: rowNum, message: 'unit_price が不正' }); continue; }
    if (amount === null || amount < 0) { errors.push({ row: rowNum, message: 'amount が不正' }); continue; }

    const ym = toYearMonth(r.sale_date);
    const year = parseInt(ym.substring(0, 4));
    const month = parseInt(ym.substring(5, 7));

    inserts.push([
      r.sale_date, year, month, ym, categoryId, productId, quantity,
      unitPrice, parseNum(r.cost_price), amount, parseNum(r.cost_amount),
      r.customer_name || null, r.description || null,
    ]);
  }

  if (errors.length > 0 && inserts.length === 0) {
    return res.status(422).json({ errors });
  }

  // バルクインサート
  let inserted = 0;
  if (inserts.length > 0) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const vals of inserts) {
        await conn.query(
          `INSERT INTO sales
           (sale_date, year, month, year_month, category_id, product_id, quantity,
            unit_price, cost_price, amount, cost_amount, customer_name, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          vals
        );
        inserted++;
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  res.json({ inserted, skipped: errors.length, errors: errors.slice(0, 50) });
});

/**
 * GET /api/export/sales
 * Query: year_month, category_id, from, to
 * Returns JSON array (client converts to CSV)
 */
router.get('/sales', async (req: any, res: any) => {
  const { year_month, category_id, from, to } = req.query;

  let sql = `
    SELECT
      s.sale_date, c.name AS category_name, p.name AS product_name,
      s.quantity, s.unit_price, s.cost_price, s.amount, s.cost_amount,
      (s.amount - IFNULL(s.cost_amount, 0)) AS profit_amount,
      CASE WHEN s.amount > 0
           THEN ROUND((s.amount - IFNULL(s.cost_amount,0)) / s.amount * 100, 2)
           ELSE NULL END AS profit_rate,
      s.customer_name, s.description
    FROM sales s
    JOIN categories c ON s.category_id = c.id
    LEFT JOIN products p ON s.product_id = p.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (year_month) { sql += ' AND s.year_month = ?'; params.push(year_month); }
  if (from) { sql += ' AND s.year_month >= ?'; params.push(from); }
  if (to) { sql += ' AND s.year_month <= ?'; params.push(to); }
  if (category_id) { sql += ' AND s.category_id = ?'; params.push(category_id); }
  sql += ' ORDER BY s.sale_date, s.id';

  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

export default router;
