/**
 * routes/forecasts.ts
 * ─────────────────────────────────────────────────────────────
 * 予定売上 (forecasts テーブル) の CRUD API ルーター。
 * 月×カテゴリ単位で売上予定を管理する。
 *
 * エンドポイント一覧:
 *   GET    /api/forecasts       予定売上一覧 (フィルタ対応)
 *   POST   /api/forecasts       予定売上 upsert (新規 or 更新)
 *   PUT    /api/forecasts/:id   予定売上更新
 *   DELETE /api/forecasts/:id   予定売上削除
 *
 * アクセス制御:
 *   GET    : viewer 以上
 *   POST/PUT/DELETE : manager 以上 (index.ts で requireRole('manager') 適用済み)
 *
 * 重要: UNIQUE KEY (year_month, category_id) により同月同カテゴリは1件のみ。
 *       POST は INSERT ... ON DUPLICATE KEY UPDATE で upsert 動作となる。
 * ─────────────────────────────────────────────────────────────
 */
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import pool from '../db';

const router = Router();

// ─────────────────────────────────────────────────────────────
// GET /api/forecasts
// 予定売上一覧取得
// ─────────────────────────────────────────────────────────────
/**
 * クエリパラメータ:
 *   year_month : 特定月 "YYYY-MM" での完全一致
 *   from       : 開始年月 "YYYY-MM" (含む)
 *   to         : 終了年月 "YYYY-MM" (含む)
 *
 * forecast_profit = forecast_amount × (1 - forecast_cost_rate)
 * を SQL で計算して付加する。
 * categories を JOIN してカテゴリ名も含めて返す。
 */
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

  if (year_month) { sql += ' AND f.year_month = ?';  params.push(year_month); }
  if (from)       { sql += ' AND f.year_month >= ?'; params.push(from); }
  if (to)         { sql += ' AND f.year_month <= ?'; params.push(to); }

  // 年月順 → カテゴリの sort_order 順で並べる
  sql += ' ORDER BY f.year_month, c.sort_order';

  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// ─────────────────────────────────────────────────────────────
// POST /api/forecasts
// 予定売上 upsert (新規登録 または 既存データの上書き更新)
// ─────────────────────────────────────────────────────────────
/**
 * リクエストボディ:
 *   year_month         (必須) : 対象年月 "YYYY-MM"
 *   category_id        (必須) : カテゴリID
 *   forecast_amount    (必須) : 予定売上金額 (0以上)
 *   forecast_cost_rate (任意) : 予定原価率 0.0〜1.0 (null 可)
 *   notes              (任意) : 備考
 *
 * INSERT ... ON DUPLICATE KEY UPDATE:
 *   UNIQUE(year_month, category_id) に一致するレコードが既存なら UPDATE
 *   存在しなければ INSERT する。
 *   フロントエンドは新規・更新どちらの場合も同じエンドポイントを呼べる。
 */
router.post(
  '/',
  [
    body('year_month').matches(/^\d{4}-\d{2}$/),                                 // "YYYY-MM" 形式チェック
    body('category_id').isInt({ min: 1 }),
    body('forecast_amount').isFloat({ min: 0 }),
    body('forecast_cost_rate').optional({ nullable: true }).isFloat({ min: 0, max: 1 }), // 0〜1 の小数
    body('notes').optional().trim(),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { year_month, category_id, forecast_amount, forecast_cost_rate, notes } = req.body;
    // year / month を year_month 文字列から導出 (冗長カラムの自動計算)
    const year  = parseInt(year_month.substring(0, 4));
    const month = parseInt(year_month.substring(5, 7));

    // upsert: 同月同カテゴリが既存なら金額・原価率・備考を更新
    const [result]: any = await pool.query(
      `INSERT INTO forecasts (year_month, year, month, category_id, forecast_amount, forecast_cost_rate, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         forecast_amount    = VALUES(forecast_amount),
         forecast_cost_rate = VALUES(forecast_cost_rate),
         notes              = VALUES(notes)`,
      [year_month, year, month, category_id, forecast_amount, forecast_cost_rate ?? null, notes ?? null]
    );

    // upsert 後のレコードを返す (year_month + category_id で特定)
    // result.insertId は UPDATE 時は 0 になるため、PK でなく UKで再取得する
    const [rows]: any = await pool.query(
      `SELECT f.*, c.name AS category_name FROM forecasts f
       JOIN categories c ON f.category_id = c.id
       WHERE f.year_month = ? AND f.category_id = ?`,
      [year_month, category_id]
    );
    res.status(201).json(rows[0]);
  }
);

// ─────────────────────────────────────────────────────────────
// PUT /api/forecasts/:id
// 予定売上更新 (ID 指定・部分更新)
// ─────────────────────────────────────────────────────────────
/**
 * 更新可能フィールド:
 *   forecast_amount    : 予定売上金額
 *   forecast_cost_rate : 予定原価率
 *   notes              : 備考
 *
 * year_month / category_id の変更は不可 (変更したい場合は DELETE → POST)
 */
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

    // 更新許可フィールドのホワイトリスト
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

// ─────────────────────────────────────────────────────────────
// DELETE /api/forecasts/:id
// 予定売上削除 (物理削除)
// ─────────────────────────────────────────────────────────────
/**
 * 予定売上は過去データの参照が不要なため物理削除。
 * カテゴリや売上データとは FK 参照関係がないので安全に削除できる。
 */
router.delete('/:id', async (req: any, res: any) => {
  const [result]: any = await pool.query('DELETE FROM forecasts WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

export default router;
