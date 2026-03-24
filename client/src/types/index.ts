/**
 * @file types/index.ts
 * @description サーバー・クライアント共通の TypeScript 型定義
 *
 * ## 設計原則
 * - API レスポンスの shape をそのまま型にする（変換しない）
 * - profit_amount / profit_rate は DB に持たずSQL計算値だが、
 *   レスポンスには含まれるため Sale 型に定義する
 * - Optional vs nullable:
 *   - null: DBにNULLが入り得るカラム（product_id, cost_price等）
 *   - optional(?): レスポンスに含まれない場合がある（管理系エンドポイントのみ返す項目）
 */

/** 売上カテゴリ（大分類） */
export interface Category {
  id: number;
  name: string;
  /** 表示順（昇順でソート） */
  sort_order: number;
  /** 0=無効(ソフトデリート), 1=有効 */
  is_active: number;
  created_at: string;
  updated_at: string;
}

/**
 * 製品マスタ。
 * default_unit_price / default_cost_price は売上入力時の初期値として使用する。
 * 実際の取引価格は sales.unit_price / cost_price に記録する（製品マスタと異なる可能性あり）。
 */
export interface Product {
  id: number;
  category_id: number;
  /** JOINで取得したカテゴリ名 */
  category_name: string;
  name: string;
  /** 製品コード（任意） */
  code: string | null;
  /** 数量の単位（例: 個, 本, ライセンス） */
  unit: string;
  /** 標準原価単価（売上入力時の初期値） */
  default_cost_price: number | null;
  /** 標準販売単価（売上入力時の初期値） */
  default_unit_price: number | null;
  /** 0=無効(ソフトデリート), 1=有効 */
  is_active: number;
  created_at: string;
  updated_at: string;
}

/**
 * 製品価格改定履歴。
 * valid_from 以降の取引に適用される標準単価の変更履歴。
 * ただし実際の取引価格は sales に実値を記録するため、この履歴は参照用。
 */
export interface ProductPriceHistory {
  id: number;
  product_id: number;
  /** 適用開始日 (YYYY-MM-DD) */
  valid_from: string;
  cost_price: number | null;
  unit_price: number | null;
  /** 改定理由（仕入れ値変更等） */
  reason: string | null;
  created_at: string;
}

/**
 * 売上レコード。
 *
 * ## year / month / year_month について
 * sale_date から派生した冗長フィールド。GROUP BY year_month が高速になる。
 * クライアントからは sale_date のみ送り、サーバーが自動設定する。
 *
 * ## profit_amount / profit_rate について
 * DB には保持せず、`amount - cost_amount` を SQL で計算して返す。
 * cost_amount が NULL の場合、profit_amount = amount（原価ゼロ扱い）。
 */
export interface Sale {
  id: number;
  /** 売上日 (YYYY-MM-DD) */
  sale_date: string;
  year: number;
  month: number;
  /** 年月 (YYYY-MM)。インデックスカラム */
  year_month: string;
  category_id: number;
  category_name: string;
  /** 製品なし登録の場合は null */
  product_id: number | null;
  product_name: string | null;
  product_unit: string | null;
  quantity: number;
  /** 実際の販売単価（製品マスタの default_unit_price とは異なる場合あり） */
  unit_price: number;
  cost_price: number | null;
  amount: number;
  cost_amount: number | null;
  /** SQL計算値: amount - IFNULL(cost_amount, 0) */
  profit_amount: number;
  /** SQL計算値: profit_amount / amount * 100 (%) */
  profit_rate: number | null;
  customer_name: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 売上一覧APIのレスポンス型（ページネーション情報付き）。
 */
export interface SaleListResponse {
  data: Sale[];
  /** 全件数（ページネーション計算に使用） */
  total: number;
  /** 現在ページ番号（1始まり） */
  page: number;
  /** 1ページあたり件数 */
  limit: number;
}

/**
 * 予定売上レコード。
 * 月×カテゴリ単位で管理（UNIQUE: year_month, category_id）。
 *
 * ## forecast_cost_rate について
 * 0〜1 の小数で保存（例: 20% → 0.20）。
 * UIでは *100 して % 表示し、入力値は /100 してAPIに送る。
 *
 * ## forecast_profit について
 * DB には保持せず `forecast_amount * (1 - forecast_cost_rate)` で計算して返す。
 */
export interface Forecast {
  id: number;
  /** 年月 (YYYY-MM) */
  year_month: string;
  year: number;
  month: number;
  category_id: number;
  category_name: string;
  forecast_amount: number;
  /** 予定原価率 (0〜1)。NULL の場合は原価率未設定 */
  forecast_cost_rate: number | null;
  /** SQL計算値: forecast_amount * (1 - IFNULL(forecast_cost_rate, 0)) */
  forecast_profit: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 月次サマリ（ダッシュボード・推移グラフ用）。
 * 1行 = 1ヶ月分の集計。
 */
export interface MonthlySummary {
  year_month: string;
  total_amount: number;
  total_cost: number;
  total_profit: number;
  /** 粗利率 (%) */
  profit_rate: number;
  total_forecast: number;
  total_forecast_profit: number;
  /** 達成率 (%) = total_amount / total_forecast * 100。予定なしの場合は null */
  achievement_rate: number | null;
  sales_count: number;
}

/**
 * 2ヶ月比較の1行（カテゴリ別）。
 * amount1/profit1 = 比較月1、amount2/profit2 = 比較月2。
 */
export interface MonthComparisonRow {
  category_id: number;
  category_name: string;
  amount1: number;
  cost1: number;
  profit1: number;
  amount2: number;
  cost2: number;
  profit2: number;
  /** amount2 - amount1 */
  diff_amount: number;
  /** (amount2 - amount1) / amount1 * 100 (%)。amount1=0 の場合 null */
  diff_rate: number | null;
  profit_rate1: number;
  profit_rate2: number;
}

/**
 * 実績 vs 予定の1行（カテゴリ別）。
 * 実績がないカテゴリも予定があれば含まれる（LEFT JOIN）。
 */
export interface ActualVsForecastRow {
  category_id: number;
  category_name: string;
  actual_amount: number;
  actual_cost: number;
  actual_profit: number;
  forecast_amount: number | null;
  forecast_cost_rate: number | null;
  forecast_profit: number | null;
  /** actual_amount / forecast_amount * 100 (%)。予定なしの場合 null */
  achievement_rate: number | null;
}

/**
 * 利益分析の1行（月×カテゴリ×製品の集計）。
 * product_id が null の行は「製品なし」の集計。
 */
export interface ProfitAnalysisRow {
  year_month: string;
  category_id: number;
  category_name: string;
  product_id: number | null;
  product_name: string | null;
  sales_count: number;
  total_quantity: number;
  total_amount: number;
  total_cost: number;
  total_profit: number;
  /** 粗利率 (%) */
  profit_rate: number;
}

/**
 * 製品別ランキングの1行（集計期間全体）。
 * total_amount の降順でソートされて返される。
 */
export interface ProductRankingRow {
  product_id: number;
  product_name: string;
  unit: string;
  category_id: number;
  category_name: string;
  sales_count: number;
  total_quantity: number;
  total_amount: number;
  total_cost: number;
  total_profit: number;
  profit_rate: number;
}
