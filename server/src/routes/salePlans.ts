/**
 * routes/salePlans.ts
 * ─────────────────────────────────────────────────────────────
 * 売上予定案件 (sale_plans テーブル) の CRUD + 売上転換 API。
 *
 * エンドポイント一覧:
 *   GET    /api/sale-plans          一覧取得 (year_month / status フィルタ)
 *   POST   /api/sale-plans          新規登録
 *   PUT    /api/sale-plans/:id      更新 (pending のみ)
 *   DELETE /api/sale-plans/:id      削除 (pending のみ)
 *   POST   /api/sale-plans/:id/convert  売上実績へ転換
 *
 * convert エンドポイント:
 *   sale_plans の status を 'converted' に更新し、
 *   同時に sales テーブルに INSERT して sales_id を紐付ける。
 *   トランザクションで一括コミット。
 * ─────────────────────────────────────────────────────────────
 */
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import pool from '../db';

const router = Router();

function toYearMonth(date: string): string {
  return date.substring(0, 7);
}

// ─────────────────────────────────────────────────────────────
// GET /api/sale-plans
// ─────────────────────────────────────────────────────────────
router.get('/', async (req: any, res: any) => {
  const { year_month, status, page = '1', limit = '50' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let sql = `
    SELECT sp.*,
           c.name AS category_name,
           p.name AS product_name
    FROM sale_plans sp
    JOIN categories c ON sp.category_id = c.id
    LEFT JOIN products p ON sp.product_id = p.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (year_month) { sql += ' AND sp.`year_month` = ?'; params.push(year_month); }
  if (status)     { sql += ' AND sp.status = ?';       params.push(status); }

  // 件数取得
  const [countRows]: any = await pool.query(
    `SELECT COUNT(*) AS total FROM sale_plans sp WHERE 1=1${year_month ? ' AND sp.`year_month` = ?' : ''}${status ? ' AND sp.status = ?' : ''}`,
    params
  );
  const total = countRows[0].total;

  sql += ' ORDER BY sp.plan_date DESC, sp.id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);

  const [rows] = await pool.query(sql, params);
  res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
});

// ─────────────────────────────────────────────────────────────
// POST /api/sale-plans
// ─────────────────────────────────────────────────────────────
const planValidators = [
  body('plan_date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('plan_date は YYYY-MM-DD 形式'),
  body('category_id').isInt({ min: 1 }),
  body('product_id').optional({ nullable: true }).isInt({ min: 1 }),
  body('quantity').isFloat({ min: 0 }),
  body('unit_price').isFloat({ min: 0 }),
  body('cost_price').optional({ nullable: true }).isFloat({ min: 0 }),
  body('amount').isFloat({ min: 0 }),
  body('cost_amount').optional({ nullable: true }).isFloat({ min: 0 }),
  body('customer_name').optional().trim().isLength({ max: 200 }),
  body('department').optional().trim().isLength({ max: 100 }),
  body('section').optional().trim().isLength({ max: 100 }),
  body('description').optional().trim(),
];

router.post('/', planValidators, async (req: any, res: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    plan_date, category_id, product_id, quantity, unit_price,
    cost_price, amount, cost_amount, customer_name, department, section, description,
  } = req.body;

  const ym    = toYearMonth(plan_date);
  const year  = parseInt(ym.substring(0, 4));
  const month = parseInt(ym.substring(5, 7));

  const [result]: any = await pool.query(
    `INSERT INTO sale_plans
       (plan_date, \`year\`, \`month\`, \`year_month\`,
        category_id, product_id, quantity, unit_price, cost_price,
        amount, cost_amount, customer_name, department, section, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [plan_date, year, month, ym,
     category_id, product_id ?? null, quantity, unit_price, cost_price ?? null,
     amount, cost_amount ?? null, customer_name ?? null, department ?? null,
     section ?? null, description ?? null]
  );

  const [rows]: any = await pool.query(
    `SELECT sp.*, c.name AS category_name, p.name AS product_name
     FROM sale_plans sp
     JOIN categories c ON sp.category_id = c.id
     LEFT JOIN products p ON sp.product_id = p.id
     WHERE sp.id = ?`,
    [result.insertId]
  );
  res.status(201).json(rows[0]);
});

// ─────────────────────────────────────────────────────────────
// PUT /api/sale-plans/:id  (pending のみ更新可)
// ─────────────────────────────────────────────────────────────
router.put('/:id', planValidators, async (req: any, res: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const [existing]: any = await pool.query('SELECT status FROM sale_plans WHERE id = ?', [req.params.id]);
  if (existing.length === 0) return res.status(404).json({ error: 'Not found' });
  if (existing[0].status === 'converted') return res.status(400).json({ error: '転換済みの予定は編集できません' });

  const {
    plan_date, category_id, product_id, quantity, unit_price,
    cost_price, amount, cost_amount, customer_name, department, section, description,
  } = req.body;

  const ym    = toYearMonth(plan_date);
  const year  = parseInt(ym.substring(0, 4));
  const month = parseInt(ym.substring(5, 7));

  await pool.query(
    `UPDATE sale_plans SET
       plan_date=?, \`year\`=?, \`month\`=?, \`year_month\`=?,
       category_id=?, product_id=?, quantity=?, unit_price=?, cost_price=?,
       amount=?, cost_amount=?, customer_name=?, department=?, section=?, description=?
     WHERE id = ?`,
    [plan_date, year, month, ym,
     category_id, product_id ?? null, quantity, unit_price, cost_price ?? null,
     amount, cost_amount ?? null, customer_name ?? null, department ?? null,
     section ?? null, description ?? null, req.params.id]
  );

  const [rows]: any = await pool.query(
    `SELECT sp.*, c.name AS category_name, p.name AS product_name
     FROM sale_plans sp
     JOIN categories c ON sp.category_id = c.id
     LEFT JOIN products p ON sp.product_id = p.id
     WHERE sp.id = ?`,
    [req.params.id]
  );
  res.json(rows[0]);
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/sale-plans/:id  (pending のみ削除可)
// ─────────────────────────────────────────────────────────────
router.delete('/:id', async (req: any, res: any) => {
  const [existing]: any = await pool.query('SELECT status FROM sale_plans WHERE id = ?', [req.params.id]);
  if (existing.length === 0) return res.status(404).json({ error: 'Not found' });
  if (existing[0].status === 'converted') return res.status(400).json({ error: '転換済みの予定は削除できません' });

  await pool.query('DELETE FROM sale_plans WHERE id = ?', [req.params.id]);
  res.status(204).send();
});

// ─────────────────────────────────────────────────────────────
// POST /api/sale-plans/:id/convert  売上実績へ転換
// plan_date を sale_date として sales テーブルに INSERT し、
// sale_plans の status を 'converted'、sales_id を更新する。
// トランザクションで一括コミット。
// ─────────────────────────────────────────────────────────────
router.post('/:id/convert', async (req: any, res: any) => {
  const [plans]: any = await pool.query(
    `SELECT sp.*, c.name AS category_name, p.name AS product_name
     FROM sale_plans sp
     JOIN categories c ON sp.category_id = c.id
     LEFT JOIN products p ON sp.product_id = p.id
     WHERE sp.id = ?`,
    [req.params.id]
  );
  if (plans.length === 0) return res.status(404).json({ error: 'Not found' });
  const plan = plans[0];
  if (plan.status === 'converted') return res.status(400).json({ error: 'すでに売上登録済みです' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // sales に INSERT
    const [salesResult]: any = await conn.query(
      `INSERT INTO sales
         (sale_date, \`year\`, \`month\`, \`year_month\`,
          category_id, product_id, quantity, unit_price, cost_price,
          amount, cost_amount, customer_name, department, section, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [plan.plan_date, plan.year, plan.month, plan.year_month,
       plan.category_id, plan.product_id, plan.quantity, plan.unit_price, plan.cost_price,
       plan.amount, plan.cost_amount, plan.customer_name, plan.department,
       plan.section, plan.description]
    );

    const salesId = salesResult.insertId;

    // sale_plans を converted に更新
    await conn.query(
      `UPDATE sale_plans SET status = 'converted', sales_id = ? WHERE id = ?`,
      [salesId, req.params.id]
    );

    await conn.commit();

    // 登録された sales レコードを返す
    const [salesRows]: any = await conn.query(
      `SELECT s.*,
              c.name AS category_name,
              p.name AS product_name,
              (s.amount - IFNULL(s.cost_amount, 0)) AS profit_amount
       FROM sales s
       JOIN categories c ON s.category_id = c.id
       LEFT JOIN products p ON s.product_id = p.id
       WHERE s.id = ?`,
      [salesId]
    );
    res.status(201).json({ sale: salesRows[0], sale_plan_id: parseInt(req.params.id) });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

export default router;
