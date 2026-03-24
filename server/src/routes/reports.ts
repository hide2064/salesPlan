/**
 * routes/reports.ts
 * ─────────────────────────────────────────────────────────────
 * 集計・分析レポート API ルーター。
 * ORM を使わず生 SQL で集計クエリを完全制御している。
 *
 * エンドポイント一覧:
 *   GET /api/reports/monthly-summary    月次サマリ (売上・原価・利益・予定・達成率)
 *   GET /api/reports/month-comparison   2ヶ月比較 (カテゴリ別ピボット)
 *   GET /api/reports/actual-vs-forecast 実績 vs 予定 (カテゴリ別)
 *   GET /api/reports/profit-analysis    利益分析 (製品・カテゴリ・期間別)
 *   GET /api/reports/product-ranking    製品別売上ランキング
 *
 * アクセス制御: viewer 以上 (index.ts で設定)
 * ─────────────────────────────────────────────────────────────
 */
import { Router } from 'express';
import pool from '../db';

const router = Router();

// ─────────────────────────────────────────────────────────────
// GET /api/reports/monthly-summary
// 月次サマリ: 売上・原価・利益・予定・達成率
// ─────────────────────────────────────────────────────────────
/**
 * クエリパラメータ:
 *   from : 開始年月 "YYYY-MM" (含む)
 *   to   : 終了年月 "YYYY-MM" (含む)
 *
 * 処理の流れ:
 *   1. sales テーブルを year_month でグループ集計
 *   2. forecasts テーブルを year_month でグループ集計
 *   3. JavaScript 側で month をキーにマージ
 *   4. achievement_rate (達成率) = actual / forecast × 100
 *
 * レスポンス例:
 *   [{ year_month: "2026-03", total_amount: 1000000, total_forecast: 900000,
 *      achievement_rate: 111.11, ... }]
 */
router.get('/monthly-summary', async (req: any, res: any) => {
  const { from, to } = req.query;

  let whereSales    = 'WHERE 1=1';
  let whereForecast = 'WHERE 1=1';
  const salesParams: any[]    = [];
  const forecastParams: any[] = [];

  // 期間フィルタ: sales と forecasts 両方に同じ条件を適用
  if (from) {
    whereSales    += ' AND s.year_month >= ?'; salesParams.push(from);
    whereForecast += ' AND f.year_month >= ?'; forecastParams.push(from);
  }
  if (to) {
    whereSales    += ' AND s.year_month <= ?'; salesParams.push(to);
    whereForecast += ' AND f.year_month <= ?'; forecastParams.push(to);
  }

  // 売上実績を年月単位で集計
  // IFNULL(cost_amount, 0): 原価が未入力の売上は 0 として計算
  const [salesRows]: any = await pool.query(
    `SELECT
       s.year_month,
       SUM(s.amount)      AS total_amount,
       SUM(s.cost_amount) AS total_cost,
       SUM(s.amount - IFNULL(s.cost_amount, 0)) AS total_profit,
       COUNT(*)           AS sales_count
     FROM sales s
     ${whereSales}
     GROUP BY s.year_month
     ORDER BY s.year_month`,
    salesParams
  );

  // 予定売上を年月単位で集計
  // forecast_profit = forecast_amount × (1 - forecast_cost_rate)
  const [forecastRows]: any = await pool.query(
    `SELECT
       f.year_month,
       SUM(f.forecast_amount) AS total_forecast,
       SUM(f.forecast_amount * (1 - IFNULL(f.forecast_cost_rate, 0))) AS total_forecast_profit
     FROM forecasts f
     ${whereForecast}
     GROUP BY f.year_month`,
    forecastParams
  );

  // forecasts を Map 化して O(1) でルックアップ
  const forecastMap: Record<string, any> = {};
  for (const r of forecastRows) forecastMap[r.year_month] = r;

  // 売上実績に予定データをマージして達成率を計算
  const result = salesRows.map((s: any) => {
    const f = forecastMap[s.year_month] || {};
    const totalForecast = parseFloat(f.total_forecast) || 0;
    const totalAmount   = parseFloat(s.total_amount)   || 0;
    return {
      year_month:            s.year_month,
      total_amount:          totalAmount,
      total_cost:            parseFloat(s.total_cost)   || 0,
      total_profit:          parseFloat(s.total_profit) || 0,
      // 利益率 = 利益 / 売上 × 100 (小数第2位まで)
      profit_rate:           totalAmount > 0
        ? Math.round((parseFloat(s.total_profit) / totalAmount) * 10000) / 100 : 0,
      total_forecast:        totalForecast,
      total_forecast_profit: parseFloat(f.total_forecast_profit) || 0,
      // 達成率 = 実績 / 予定 × 100 (予定が 0 の場合は null)
      achievement_rate:      totalForecast > 0
        ? Math.round((totalAmount / totalForecast) * 10000) / 100 : null,
      sales_count:           s.sales_count,
    };
  });

  res.json(result);
});

// ─────────────────────────────────────────────────────────────
// GET /api/reports/month-comparison
// 2ヶ月比較: カテゴリ別の売上・原価・利益を2ヶ月で横並び比較
// ─────────────────────────────────────────────────────────────
/**
 * クエリパラメータ:
 *   month1 : 比較対象月1 "YYYY-MM" (必須)
 *   month2 : 比較対象月2 "YYYY-MM" (必須)
 *
 * CASE WHEN ピボット手法:
 *   LEFT JOIN sales を 1回だけ実行し、CASE WHEN で month1/month2 を振り分ける。
 *   → 2回クエリを実行するより効率的。
 *
 * レスポンス例:
 *   { month1: "2026-02", month2: "2026-03",
 *     data: [{ category_name: "ソフトウェア", amount1: 500000, amount2: 600000,
 *              diff_amount: 100000, diff_rate: 20.00, ... }] }
 */
router.get('/month-comparison', async (req: any, res: any) => {
  const { month1, month2 } = req.query;
  if (!month1 || !month2) return res.status(400).json({ error: 'month1 と month2 が必要です' });

  // CASE WHEN でピボット: 1クエリで2ヶ月分を横に並べる
  const [rows]: any = await pool.query(
    `SELECT
       c.id AS category_id, c.name AS category_name,
       SUM(CASE WHEN s.year_month = ? THEN s.amount ELSE 0 END)                           AS amount1,
       SUM(CASE WHEN s.year_month = ? THEN IFNULL(s.cost_amount, 0) ELSE 0 END)           AS cost1,
       SUM(CASE WHEN s.year_month = ? THEN s.amount - IFNULL(s.cost_amount,0) ELSE 0 END) AS profit1,
       SUM(CASE WHEN s.year_month = ? THEN s.amount ELSE 0 END)                           AS amount2,
       SUM(CASE WHEN s.year_month = ? THEN IFNULL(s.cost_amount, 0) ELSE 0 END)           AS cost2,
       SUM(CASE WHEN s.year_month = ? THEN s.amount - IFNULL(s.cost_amount,0) ELSE 0 END) AS profit2
     FROM categories c
     LEFT JOIN sales s ON s.category_id = c.id AND s.year_month IN (?, ?)
     WHERE c.is_active = 1
     GROUP BY c.id, c.name
     ORDER BY c.sort_order`,
    [month1, month1, month1, month2, month2, month2, month1, month2]
  );

  // 差分・増減率・利益率を計算して付加
  const data = rows.map((r: any) => ({
    ...r,
    // 差分金額: month2 - month1 (正なら増加、負なら減少)
    diff_amount: parseFloat(r.amount2) - parseFloat(r.amount1),
    // 増減率 (%): amount1 が 0 の場合は null
    diff_rate: parseFloat(r.amount1) > 0
      ? Math.round(((parseFloat(r.amount2) - parseFloat(r.amount1)) / parseFloat(r.amount1)) * 10000) / 100
      : null,
    // 各月の利益率
    profit_rate1: parseFloat(r.amount1) > 0
      ? Math.round((parseFloat(r.profit1) / parseFloat(r.amount1)) * 10000) / 100 : 0,
    profit_rate2: parseFloat(r.amount2) > 0
      ? Math.round((parseFloat(r.profit2) / parseFloat(r.amount2)) * 10000) / 100 : 0,
  }));

  res.json({ month1, month2, data });
});

// ─────────────────────────────────────────────────────────────
// GET /api/reports/actual-vs-forecast
// 実績 vs 予定: 指定月のカテゴリ別達成状況
// ─────────────────────────────────────────────────────────────
/**
 * クエリパラメータ:
 *   year_month : 対象年月 "YYYY-MM" (必須)
 *
 * 特徴:
 *   ・categories を起点に LEFT JOIN するため、売上0件のカテゴリも表示される
 *   ・forecasts が未登録のカテゴリは forecast_amount = NULL
 *   ・achievement_rate: 達成率 = actual / forecast × 100
 */
router.get('/actual-vs-forecast', async (req: any, res: any) => {
  const { year_month } = req.query;
  if (!year_month) return res.status(400).json({ error: 'year_month が必要です' });

  const [rows]: any = await pool.query(
    `SELECT
       c.id AS category_id, c.name AS category_name,
       IFNULL(SUM(s.amount), 0)                              AS actual_amount,
       IFNULL(SUM(s.cost_amount), 0)                         AS actual_cost,
       IFNULL(SUM(s.amount - IFNULL(s.cost_amount,0)), 0)    AS actual_profit,
       f.forecast_amount,
       f.forecast_cost_rate,
       -- 予定利益 = 予定売上 × (1 - 予定原価率)
       ROUND(f.forecast_amount * (1 - IFNULL(f.forecast_cost_rate, 0)), 2) AS forecast_profit,
       -- 達成率: 予定が 0 または未登録なら NULL
       CASE WHEN f.forecast_amount > 0
            THEN ROUND(IFNULL(SUM(s.amount), 0) / f.forecast_amount * 100, 2)
            ELSE NULL END AS achievement_rate
     FROM categories c
     LEFT JOIN sales s     ON s.category_id = c.id AND s.year_month = ?
     LEFT JOIN forecasts f ON f.category_id = c.id AND f.year_month = ?
     WHERE c.is_active = 1
     GROUP BY c.id, c.name, f.forecast_amount, f.forecast_cost_rate
     ORDER BY c.sort_order`,
    [year_month, year_month]
  );

  res.json({ year_month, data: rows });
});

// ─────────────────────────────────────────────────────────────
// GET /api/reports/profit-analysis
// 利益分析: 製品・カテゴリ別・期間指定の詳細利益分析
// ─────────────────────────────────────────────────────────────
/**
 * クエリパラメータ:
 *   from        : 開始年月 "YYYY-MM"
 *   to          : 終了年月 "YYYY-MM"
 *   category_id : カテゴリ絞り込み
 *   product_id  : 製品絞り込み
 *
 * グループ: year_month × category × product
 * → 月ごと・カテゴリごと・製品ごとの利益が確認できる
 * → product_id が NULL の売上は p.id/p.name が NULL で集約される
 */
router.get('/profit-analysis', async (req: any, res: any) => {
  const { from, to, category_id, product_id } = req.query;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (from)        { where += ' AND s.year_month >= ?';  params.push(from); }
  if (to)          { where += ' AND s.year_month <= ?';  params.push(to); }
  if (category_id) { where += ' AND s.category_id = ?';  params.push(category_id); }
  if (product_id)  { where += ' AND s.product_id = ?';   params.push(product_id); }

  const [rows]: any = await pool.query(
    `SELECT
       s.year_month,
       c.id AS category_id, c.name AS category_name,
       p.id AS product_id,  p.name AS product_name,
       COUNT(*)              AS sales_count,
       SUM(s.quantity)       AS total_quantity,
       SUM(s.amount)         AS total_amount,
       SUM(IFNULL(s.cost_amount, 0))              AS total_cost,
       SUM(s.amount - IFNULL(s.cost_amount, 0))   AS total_profit,
       -- 利益率 = 利益 / 売上 × 100
       CASE WHEN SUM(s.amount) > 0
            THEN ROUND(SUM(s.amount - IFNULL(s.cost_amount,0)) / SUM(s.amount) * 100, 2)
            ELSE 0 END AS profit_rate
     FROM sales s
     JOIN categories c  ON s.category_id = c.id
     LEFT JOIN products p ON s.product_id = p.id
     ${where}
     GROUP BY s.year_month, c.id, c.name, p.id, p.name
     ORDER BY s.year_month, total_profit DESC`,
    params
  );

  res.json(rows);
});

// ─────────────────────────────────────────────────────────────
// GET /api/reports/product-ranking
// 製品別売上ランキング: 指定期間の売上金額上位 N 件
// ─────────────────────────────────────────────────────────────
/**
 * クエリパラメータ:
 *   from        : 開始年月 "YYYY-MM"
 *   to          : 終了年月 "YYYY-MM"
 *   category_id : カテゴリ絞り込み
 *   limit       : 取得件数 (デフォルト 20)
 *
 * WHERE p.id IS NOT NULL: 製品未登録の売上は除外
 * ORDER BY total_amount DESC: 売上金額の多い順にランキング
 */
router.get('/product-ranking', async (req: any, res: any) => {
  const { from, to, category_id, limit = '20' } = req.query;

  // 製品なし (product_id IS NULL) の売上はランキング対象外
  let where = 'WHERE p.id IS NOT NULL';
  const params: any[] = [];

  if (from)        { where += ' AND s.year_month >= ?'; params.push(from); }
  if (to)          { where += ' AND s.year_month <= ?'; params.push(to); }
  if (category_id) { where += ' AND s.category_id = ?'; params.push(category_id); }

  params.push(parseInt(limit as string));

  const [rows]: any = await pool.query(
    `SELECT
       p.id AS product_id, p.name AS product_name, p.unit,
       c.id AS category_id, c.name AS category_name,
       COUNT(*)              AS sales_count,
       SUM(s.quantity)       AS total_quantity,
       SUM(s.amount)         AS total_amount,
       SUM(IFNULL(s.cost_amount, 0))            AS total_cost,
       SUM(s.amount - IFNULL(s.cost_amount, 0)) AS total_profit,
       CASE WHEN SUM(s.amount) > 0
            THEN ROUND(SUM(s.amount - IFNULL(s.cost_amount,0)) / SUM(s.amount) * 100, 2)
            ELSE 0 END AS profit_rate
     FROM sales s
     JOIN categories c    ON s.category_id = c.id
     LEFT JOIN products p ON s.product_id  = p.id
     ${where}
     GROUP BY p.id, p.name, p.unit, c.id, c.name
     ORDER BY total_amount DESC
     LIMIT ?`,
    params
  );

  res.json(rows);
});

export default router;
