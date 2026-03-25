/**
 * routes/sales.ts
 * ─────────────────────────────────────────────────────────────
 * 売上実績 (sales テーブル) の CRUD API ルーター。
 *
 * エンドポイント一覧:
 *   GET    /api/sales          売上一覧取得 (フィルタ + ページネーション)
 *   POST   /api/sales          売上新規登録
 *   PUT    /api/sales/:id      売上更新
 *   DELETE /api/sales/:id      売上削除
 *
 * アクセス制御:
 *   GET    : viewer 以上 (index.ts の requireRole は manager+ だが、
 *            SalesList.tsx は viewer でも閲覧可のため注意: 実際には
 *            index.ts で manager+ ガードがかかっているため viewer は
 *            現状 GET も不可。必要なら index.ts の設定を変更すること)
 *   POST/PUT/DELETE : manager 以上 (index.ts で requireRole('manager') 適用済み)
 *
 * 重要な設計:
 *   ・profit_amount / profit_rate はカラムを持たず SQL で計算
 *     = amount - IFNULL(cost_amount, 0)
 *   ・sale_date から year / month / year_month を自動計算して保存
 *     (冗長だが集計クエリの高速化のため)
 * ─────────────────────────────────────────────────────────────
 */
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import pool from '../db';

const router = Router();

/**
 * toYearMonth - 日付文字列から年月部分を切り出す
 * @example toYearMonth('2026-03-15') → '2026-03'
 */
function toYearMonth(date: string): string {
  return date.substring(0, 7);
}

// ─────────────────────────────────────────────────────────────
// GET /api/sales
// 売上一覧取得 (フィルタ・ページネーション対応)
// ─────────────────────────────────────────────────────────────
/**
 * クエリパラメータ:
 *   year_month    : "YYYY-MM" 形式で絞り込み
 *   category_id   : カテゴリID で絞り込み
 *   product_id    : 製品ID で絞り込み
 *   customer_name : 顧客名の部分一致 (LIKE %keyword%)
 *   page          : ページ番号 (デフォルト 1)
 *   limit         : 1ページの件数 (デフォルト 50)
 *
 * レスポンス:
 *   { data: Sale[], total: number, page: number, limit: number }
 *   profit_amount / profit_rate は SQL で計算して付加
 */
router.get('/', async (req: any, res: any) => {
  const { year_month, category_id, product_id, customer_name, department, section, page = '1', limit = '50' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // メインクエリ: categories・products を JOIN して名前も取得
  // profit_amount = amount - cost_amount (cost_amount が NULL の場合は 0 扱い)
  // profit_rate   = profit_amount / amount × 100 (amount が 0 の場合は NULL)
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

  // 動的 WHERE 条件: 指定されたパラメータのみ追加
  if (year_month)    { sql += ' AND s.`year_month` = ?';       params.push(year_month); }
  if (category_id)   { sql += ' AND s.category_id = ?';        params.push(category_id); }
  if (product_id)    { sql += ' AND s.product_id = ?';         params.push(product_id); }
  if (customer_name) { sql += ' AND s.customer_name LIKE ?';   params.push(`%${customer_name}%`); }
  if (department)    { sql += ' AND s.department LIKE ?';      params.push(`%${department}%`); }
  if (section)       { sql += ' AND s.section LIKE ?';         params.push(`%${section}%`); }

  // 件数取得: ページネーションの総件数表示に使用
  const [countRows]: any = await pool.query(
    `SELECT COUNT(*) AS total FROM sales s WHERE 1=1${
      year_month    ? ' AND s.`year_month` = ?'      : ''}${
      category_id   ? ' AND s.category_id = ?'       : ''}${
      product_id    ? ' AND s.product_id = ?'        : ''}${
      customer_name ? ' AND s.customer_name LIKE ?' : ''}${
      department    ? ' AND s.department LIKE ?'    : ''}${
      section       ? ' AND s.section LIKE ?'       : ''}`,
    params
  );
  const total = countRows[0].total;

  // ソート・ページネーション: 最新日付順、同日は id 降順
  sql += ' ORDER BY s.sale_date DESC, s.id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);

  const [rows] = await pool.query(sql, params);
  res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
});

// ─────────────────────────────────────────────────────────────
// GET /api/sales/by-department
// 部署別集計: 指定期間の部署ごとの売上・利益サマリ
// ─────────────────────────────────────────────────────────────
router.get('/by-department', async (req: any, res: any) => {
  const { year_month, from, to } = req.query;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (year_month) { where += ' AND s.`year_month` = ?'; params.push(year_month); }
  if (from)       { where += ' AND s.`year_month` >= ?'; params.push(from); }
  if (to)         { where += ' AND s.`year_month` <= ?'; params.push(to); }

  const [rows]: any = await pool.query(
    `SELECT
       IFNULL(s.department, '（未設定）') AS department,
       IFNULL(s.section,    '（未設定）') AS section,
       COUNT(*)                           AS sales_count,
       SUM(s.amount)                      AS total_amount,
       SUM(IFNULL(s.cost_amount, 0))      AS total_cost,
       SUM(s.amount - IFNULL(s.cost_amount, 0)) AS total_profit,
       CASE WHEN SUM(s.amount) > 0
            THEN ROUND(SUM(s.amount - IFNULL(s.cost_amount, 0)) / SUM(s.amount) * 100, 2)
            ELSE 0 END AS profit_rate
     FROM sales s
     ${where}
     GROUP BY s.department, s.section
     ORDER BY department ASC, total_amount DESC`,
    params
  );

  res.json(rows.map((r: any) => ({
    department:   r.department,
    section:      r.section,
    sales_count:  r.sales_count,
    total_amount: parseFloat(r.total_amount) || 0,
    total_cost:   parseFloat(r.total_cost)   || 0,
    total_profit: parseFloat(r.total_profit) || 0,
    profit_rate:  parseFloat(r.profit_rate)  || 0,
  })));
});

// ─────────────────────────────────────────────────────────────
// POST /api/sales
// 売上新規登録
// ─────────────────────────────────────────────────────────────
/**
 * リクエストボディ:
 *   sale_date     (必須) : 売上日 "YYYY-MM-DD"
 *   category_id   (必須) : カテゴリID
 *   product_id    (任意) : 製品ID (null 可: 製品なし売上)
 *   quantity      (必須) : 数量 (0以上)
 *   unit_price    (必須) : 販売単価 (0以上)
 *   cost_price    (任意) : 原価単価 (null 可)
 *   amount        (必須) : 売上金額 (0以上)
 *   cost_amount   (任意) : 原価合計 (null 可)
 *   customer_name (任意) : 顧客名 (最大200文字)
 *   description   (任意) : 備考
 *
 * year / month / year_month は sale_date から自動計算して保存。
 */
router.post(
  '/',
  [
    body('sale_date').isISO8601(),                                       // YYYY-MM-DD 形式チェック
    body('category_id').isInt({ min: 1 }),                              // 正の整数
    body('product_id').optional({ nullable: true }).isInt({ min: 1 }), // null または正の整数
    body('quantity').isFloat({ min: 0 }),
    body('unit_price').isFloat({ min: 0 }),
    body('cost_price').optional({ nullable: true }).isFloat({ min: 0 }),
    body('amount').isFloat({ min: 0 }),
    body('cost_amount').optional({ nullable: true }).isFloat({ min: 0 }),
    body('customer_name').optional().trim().isLength({ max: 200 }),
    body('department').optional().trim().isLength({ max: 100 }),
    body('section').optional().trim().isLength({ max: 100 }),
    body('description').optional().trim(),
  ],
  async (req: any, res: any) => {
    // バリデーションエラーがあれば 400 で返す
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { sale_date, category_id, product_id, quantity, unit_price, cost_price,
            amount, cost_amount, customer_name, department, section, description } = req.body;

    // sale_date から year / month / year_month を導出
    const ym    = toYearMonth(sale_date);
    const year  = parseInt(ym.substring(0, 4));
    const month = parseInt(ym.substring(5, 7));

    const [result]: any = await pool.query(
      `INSERT INTO sales
       (sale_date, \`year\`, \`month\`, \`year_month\`, category_id, product_id, quantity,
        unit_price, cost_price, amount, cost_amount, customer_name, department, section, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sale_date, year, month, ym, category_id, product_id ?? null, quantity,
       unit_price, cost_price ?? null, amount, cost_amount ?? null,
       customer_name ?? null, department ?? null, section ?? null, description ?? null]
    );

    // 挿入した行を JOIN 付きで再取得してレスポンス
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

// ─────────────────────────────────────────────────────────────
// PUT /api/sales/:id
// 売上更新 (部分更新: 送られたフィールドのみ更新)
// ─────────────────────────────────────────────────────────────
/**
 * sale_date を更新すると year / month / year_month も自動的に再計算される。
 * 送信しないフィールドは変更されない (PATCH 的な動作)。
 */
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

    // 更新を許可するフィールドのホワイトリスト (SQL インジェクション防止)
    const allowed = ['category_id', 'product_id', 'quantity', 'unit_price', 'cost_price',
                     'amount', 'cost_amount', 'customer_name', 'department', 'section', 'description'];
    const fields: string[] = [];
    const values: any[] = [];

    // sale_date が更新される場合は関連するカラムも同時更新
    if (req.body.sale_date) {
      const ym = toYearMonth(req.body.sale_date);
      fields.push('sale_date = ?', '`year` = ?', '`month` = ?', '`year_month` = ?');
      values.push(req.body.sale_date, parseInt(ym.substring(0, 4)), parseInt(ym.substring(5, 7)), ym);
    }

    // 送信されたフィールドのみ SET 句に追加
    for (const key of allowed) {
      if (req.body[key] !== undefined) { fields.push(`${key} = ?`); values.push(req.body[key]); }
    }

    if (fields.length === 0) return res.status(400).json({ error: '更新フィールドがありません' });

    values.push(req.params.id);
    await pool.query(`UPDATE sales SET ${fields.join(', ')} WHERE id = ?`, values);

    // 更新後の行を JOIN 付きで返す
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

// ─────────────────────────────────────────────────────────────
// DELETE /api/sales/:id
// 売上削除 (物理削除)
// ─────────────────────────────────────────────────────────────
/**
 * 売上データは物理削除。
 * affectedRows が 0 の場合は対象レコードが存在しないため 404 を返す。
 */
router.delete('/:id', async (req: any, res: any) => {
  const [result]: any = await pool.query('DELETE FROM sales WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send(); // 204 No Content: 削除成功、ボディなし
});

export default router;
