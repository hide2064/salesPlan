import { Router } from 'express';
import pool from '../db';

const router = Router();

// 月次集計: 売上・原価・利益・予定・達成率
router.get('/monthly-summary', async (req: any, res: any) => {
  const { from, to } = req.query;

  let whereSales = 'WHERE 1=1';
  let whereForecast = 'WHERE 1=1';
  const salesParams: any[] = [];
  const forecastParams: any[] = [];

  if (from) { whereSales += ' AND s.year_month >= ?'; salesParams.push(from); whereForecast += ' AND f.year_month >= ?'; forecastParams.push(from); }
  if (to) { whereSales += ' AND s.year_month <= ?'; salesParams.push(to); whereForecast += ' AND f.year_month <= ?'; forecastParams.push(to); }

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

  const forecastMap: Record<string, any> = {};
  for (const r of forecastRows) forecastMap[r.year_month] = r;

  const result = salesRows.map((s: any) => {
    const f = forecastMap[s.year_month] || {};
    const totalForecast = parseFloat(f.total_forecast) || 0;
    const totalAmount = parseFloat(s.total_amount) || 0;
    return {
      year_month: s.year_month,
      total_amount: totalAmount,
      total_cost: parseFloat(s.total_cost) || 0,
      total_profit: parseFloat(s.total_profit) || 0,
      profit_rate: totalAmount > 0 ? Math.round((parseFloat(s.total_profit) / totalAmount) * 10000) / 100 : 0,
      total_forecast: totalForecast,
      total_forecast_profit: parseFloat(f.total_forecast_profit) || 0,
      achievement_rate: totalForecast > 0 ? Math.round((totalAmount / totalForecast) * 10000) / 100 : null,
      sales_count: s.sales_count,
    };
  });

  res.json(result);
});

// 2ヶ月比較
router.get('/month-comparison', async (req: any, res: any) => {
  const { month1, month2 } = req.query;
  if (!month1 || !month2) return res.status(400).json({ error: 'month1 と month2 が必要です' });

  const [rows]: any = await pool.query(
    `SELECT
       c.id AS category_id, c.name AS category_name,
       SUM(CASE WHEN s.year_month = ? THEN s.amount ELSE 0 END)                              AS amount1,
       SUM(CASE WHEN s.year_month = ? THEN IFNULL(s.cost_amount, 0) ELSE 0 END)              AS cost1,
       SUM(CASE WHEN s.year_month = ? THEN s.amount - IFNULL(s.cost_amount,0) ELSE 0 END)    AS profit1,
       SUM(CASE WHEN s.year_month = ? THEN s.amount ELSE 0 END)                              AS amount2,
       SUM(CASE WHEN s.year_month = ? THEN IFNULL(s.cost_amount, 0) ELSE 0 END)              AS cost2,
       SUM(CASE WHEN s.year_month = ? THEN s.amount - IFNULL(s.cost_amount,0) ELSE 0 END)    AS profit2
     FROM categories c
     LEFT JOIN sales s ON s.category_id = c.id AND s.year_month IN (?, ?)
     WHERE c.is_active = 1
     GROUP BY c.id, c.name
     ORDER BY c.sort_order`,
    [month1, month1, month1, month2, month2, month2, month1, month2]
  );

  const data = rows.map((r: any) => ({
    ...r,
    diff_amount: parseFloat(r.amount2) - parseFloat(r.amount1),
    diff_rate: parseFloat(r.amount1) > 0
      ? Math.round(((parseFloat(r.amount2) - parseFloat(r.amount1)) / parseFloat(r.amount1)) * 10000) / 100
      : null,
    profit_rate1: parseFloat(r.amount1) > 0
      ? Math.round((parseFloat(r.profit1) / parseFloat(r.amount1)) * 10000) / 100 : 0,
    profit_rate2: parseFloat(r.amount2) > 0
      ? Math.round((parseFloat(r.profit2) / parseFloat(r.amount2)) * 10000) / 100 : 0,
  }));

  res.json({ month1, month2, data });
});

// 実績 vs 予定（カテゴリ別）
router.get('/actual-vs-forecast', async (req: any, res: any) => {
  const { year_month } = req.query;
  if (!year_month) return res.status(400).json({ error: 'year_month が必要です' });

  const [rows]: any = await pool.query(
    `SELECT
       c.id AS category_id, c.name AS category_name,
       IFNULL(SUM(s.amount), 0) AS actual_amount,
       IFNULL(SUM(s.cost_amount), 0) AS actual_cost,
       IFNULL(SUM(s.amount - IFNULL(s.cost_amount,0)), 0) AS actual_profit,
       f.forecast_amount,
       f.forecast_cost_rate,
       ROUND(f.forecast_amount * (1 - IFNULL(f.forecast_cost_rate, 0)), 2) AS forecast_profit,
       CASE WHEN f.forecast_amount > 0
            THEN ROUND(IFNULL(SUM(s.amount), 0) / f.forecast_amount * 100, 2)
            ELSE NULL END AS achievement_rate
     FROM categories c
     LEFT JOIN sales s ON s.category_id = c.id AND s.year_month = ?
     LEFT JOIN forecasts f ON f.category_id = c.id AND f.year_month = ?
     WHERE c.is_active = 1
     GROUP BY c.id, c.name, f.forecast_amount, f.forecast_cost_rate
     ORDER BY c.sort_order`,
    [year_month, year_month]
  );

  res.json({ year_month, data: rows });
});

// 利益分析（製品・カテゴリ別・期間）
router.get('/profit-analysis', async (req: any, res: any) => {
  const { from, to, category_id, product_id } = req.query;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (from) { where += ' AND s.year_month >= ?'; params.push(from); }
  if (to) { where += ' AND s.year_month <= ?'; params.push(to); }
  if (category_id) { where += ' AND s.category_id = ?'; params.push(category_id); }
  if (product_id) { where += ' AND s.product_id = ?'; params.push(product_id); }

  const [rows]: any = await pool.query(
    `SELECT
       s.year_month,
       c.id AS category_id, c.name AS category_name,
       p.id AS product_id, p.name AS product_name,
       COUNT(*) AS sales_count,
       SUM(s.quantity) AS total_quantity,
       SUM(s.amount) AS total_amount,
       SUM(IFNULL(s.cost_amount, 0)) AS total_cost,
       SUM(s.amount - IFNULL(s.cost_amount, 0)) AS total_profit,
       CASE WHEN SUM(s.amount) > 0
            THEN ROUND(SUM(s.amount - IFNULL(s.cost_amount,0)) / SUM(s.amount) * 100, 2)
            ELSE 0 END AS profit_rate
     FROM sales s
     JOIN categories c ON s.category_id = c.id
     LEFT JOIN products p ON s.product_id = p.id
     ${where}
     GROUP BY s.year_month, c.id, c.name, p.id, p.name
     ORDER BY s.year_month, total_profit DESC`,
    params
  );

  res.json(rows);
});

// 製品別ランキング
router.get('/product-ranking', async (req: any, res: any) => {
  const { from, to, category_id, limit = '20' } = req.query;

  let where = 'WHERE p.id IS NOT NULL';
  const params: any[] = [];

  if (from) { where += ' AND s.year_month >= ?'; params.push(from); }
  if (to) { where += ' AND s.year_month <= ?'; params.push(to); }
  if (category_id) { where += ' AND s.category_id = ?'; params.push(category_id); }

  params.push(parseInt(limit as string));

  const [rows]: any = await pool.query(
    `SELECT
       p.id AS product_id, p.name AS product_name, p.unit,
       c.id AS category_id, c.name AS category_name,
       COUNT(*) AS sales_count,
       SUM(s.quantity) AS total_quantity,
       SUM(s.amount) AS total_amount,
       SUM(IFNULL(s.cost_amount, 0)) AS total_cost,
       SUM(s.amount - IFNULL(s.cost_amount, 0)) AS total_profit,
       CASE WHEN SUM(s.amount) > 0
            THEN ROUND(SUM(s.amount - IFNULL(s.cost_amount,0)) / SUM(s.amount) * 100, 2)
            ELSE 0 END AS profit_rate
     FROM sales s
     JOIN categories c ON s.category_id = c.id
     LEFT JOIN products p ON s.product_id = p.id
     ${where}
     GROUP BY p.id, p.name, p.unit, c.id, c.name
     ORDER BY total_amount DESC
     LIMIT ?`,
    params
  );

  res.json(rows);
});

export default router;
