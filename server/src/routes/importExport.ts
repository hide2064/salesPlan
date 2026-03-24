/**
 * @file importExport.ts
 * @description CSVインポート / エクスポートルート
 *
 * ## インポート仕様 (POST /api/import/sales)
 * - クライアント側で CSV → JSON 変換済みの rows[] を受け取る
 * - カテゴリ・製品をサーバー側でメモリキャッシュし、名前→ID解決を行う
 * - バリデーションエラーと正常行を分離し、正常行のみトランザクションでバルクINSERT
 * - 一部エラーがあっても正常行は登録する（errors があっても inserted > 0 になり得る）
 * - 1リクエスト最大 1000 件制限（大量インポートは別途バッチ処理を推奨）
 *
 * ## エクスポート仕様 (GET /api/export/sales)
 * - サーバーは JSON 配列を返すだけで、CSV変換はクライアント (formatters.exportCsv) が行う
 * - 利益額・利益率はSQLで計算してエクスポートデータに含める（DBには持たない方針と整合）
 */

import { Router } from 'express';
import pool from '../db';

const router = Router();

/**
 * sale_date (YYYY-MM-DD) から year_month (YYYY-MM) を切り出す
 *
 * @param date - 日付文字列 (YYYY-MM-DD)
 * @returns YYYY-MM 形式の年月文字列
 */
function toYearMonth(date: string): string {
  return date.substring(0, 7);
}

/**
 * CSV文字列値を数値に変換する。空文字・undefined は null を返す。
 * parseFloat を使うため小数も扱える（金額・数量共通で使用）。
 *
 * @param v - CSVセルの文字列値
 * @returns 数値 or null（不正値・空値の場合）
 */
function parseNum(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

/**
 * POST /api/import/sales
 *
 * CSV取り込み：クライアントがCSVをパースした rows[] を受け取り、salesテーブルに一括登録する。
 *
 * リクエストボディ:
 * ```json
 * {
 *   "rows": [
 *     {
 *       "sale_date": "2026-03-15",       // 必須: YYYY-MM-DD
 *       "category_name": "ソフトウェア", // 必須: DBのカテゴリ名と完全一致
 *       "product_name": "業務管理 Basic",// 任意: DBの製品名と完全一致
 *       "quantity": "1",
 *       "unit_price": "150000",
 *       "cost_price": "30000",           // 任意
 *       "amount": "150000",
 *       "cost_amount": "30000",          // 任意
 *       "customer_name": "株式会社X",   // 任意
 *       "description": "初回導入"        // 任意
 *     }
 *   ]
 * }
 * ```
 *
 * レスポンス:
 * - 200: { inserted: number, skipped: number, errors: [{row, message}] }
 * - 400: rows が空 or 1000件超過
 * - 422: 全行エラー（正常行が1件もない場合）
 *
 * ## バリデーション戦略
 * - category_name / product_name は名前→ID解決（完全一致・アクティブのみ）
 * - quantity / unit_price / amount は 0 以上の数値必須
 * - cost_price / cost_amount は任意（省略可）
 * - エラー行はスキップ、正常行のみINSERT（部分成功）
 *
 * ## トランザクション
 * - 正常行を1件ずつINSERTしてもトランザクションは一括コミット
 * - 途中でDB例外が発生した場合は全ロールバック
 */
router.post('/sales', async (req: any, res: any) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows が空です' });
  }
  if (rows.length > 1000) {
    return res.status(400).json({ error: '一度に取り込めるのは1000件までです' });
  }

  // カテゴリ・製品をキャッシュ（ループ内で毎回SQLを発行しないよう事前取得）
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
    const rowNum = i + 2; // 1-indexed + ヘッダ行を考慮して2始まり

    // 日付バリデーション
    if (!r.sale_date || !r.sale_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      errors.push({ row: rowNum, message: 'sale_date が不正（YYYY-MM-DD 形式）' });
      continue;
    }
    // カテゴリ必須チェック + 名前→ID解決
    if (!r.category_name) {
      errors.push({ row: rowNum, message: 'category_name が空' });
      continue;
    }
    const categoryId = catMap[r.category_name];
    if (!categoryId) {
      errors.push({ row: rowNum, message: `カテゴリ "${r.category_name}" が見つかりません` });
      continue;
    }
    // 製品名→ID解決（任意項目：名前があるのにIDが見つからない場合はエラー）
    const productId = r.product_name ? (prodMap[r.product_name] ?? null) : null;
    if (r.product_name && !productId) {
      errors.push({ row: rowNum, message: `製品 "${r.product_name}" が見つかりません` });
      continue;
    }

    // 必須数値バリデーション
    const quantity = parseNum(r.quantity);
    const unitPrice = parseNum(r.unit_price);
    const amount = parseNum(r.amount);

    if (quantity === null || quantity < 0) { errors.push({ row: rowNum, message: 'quantity が不正' }); continue; }
    if (unitPrice === null || unitPrice < 0) { errors.push({ row: rowNum, message: 'unit_price が不正' }); continue; }
    if (amount === null || amount < 0) { errors.push({ row: rowNum, message: 'amount が不正' }); continue; }

    // year / month / year_month を sale_date から派生（DB設計の冗長フィールド）
    const ym = toYearMonth(r.sale_date);
    const year = parseInt(ym.substring(0, 4));
    const month = parseInt(ym.substring(5, 7));

    inserts.push([
      r.sale_date, year, month, ym, categoryId, productId, quantity,
      unitPrice, parseNum(r.cost_price), amount, parseNum(r.cost_amount),
      r.customer_name || null, r.description || null,
    ]);
  }

  // 全行エラーの場合は登録せずにエラーを返す
  if (errors.length > 0 && inserts.length === 0) {
    return res.status(422).json({ errors });
  }

  // バルクインサート（トランザクションで一括コミット）
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
      conn.release(); // 必ずプールに接続を返却
    }
  }

  // errors は最大50件のみ返す（大量エラー時のレスポンスサイズ制限）
  res.json({ inserted, skipped: errors.length, errors: errors.slice(0, 50) });
});

/**
 * GET /api/export/sales
 *
 * 売上データのエクスポート：JSON配列で返し、クライアント側でCSV変換する。
 * profit_amount / profit_rate は DB に保持せず SQL で計算して返す（不整合防止）。
 *
 * クエリパラメータ:
 * - year_month: YYYY-MM（特定月）
 * - category_id: カテゴリID
 * - from: YYYY-MM（開始年月）
 * - to:   YYYY-MM（終了年月）
 *
 * ※ year_month と from/to を同時指定した場合は AND 条件で絞り込む
 *
 * レスポンス:
 * - 200: SaleExportRow[] (profit_amount, profit_rate 含む)
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
