/**
 * @file reports.ts
 * @description レポートAPIコール関数
 *
 * ## エンドポイント概要
 * | 関数                   | エンドポイント                     | 用途                          |
 * |----------------------|----------------------------------|-------------------------------|
 * | fetchMonthlySummary  | GET /reports/monthly-summary      | 月次サマリ（ダッシュボード）     |
 * | fetchMonthComparison | GET /reports/month-comparison     | 2ヶ月比較                     |
 * | fetchActualVsForecast| GET /reports/actual-vs-forecast   | 実績 vs 予定（予定管理画面）    |
 * | fetchProfitAnalysis  | GET /reports/profit-analysis      | 月×カテゴリ別利益分析           |
 * | fetchProductRanking  | GET /reports/product-ranking      | 製品別売上・利益ランキング       |
 *
 * ## 期間指定の統一
 * - from / to は YYYY-MM 形式の year_month 値を使用
 * - サーバーは year_month カラムで絞り込む（インデックス活用）
 */

import api from './client';
import type {
  MonthlySummary,
  MonthComparisonRow,
  ActualVsForecastRow,
  ProfitAnalysisRow,
  ProductRankingRow,
} from '../types';

/**
 * 月次サマリを取得する。
 * ダッシュボードの推移グラフ・KPIカード用。
 * from/to を省略すると全期間を返す（パフォーマンス注意）。
 *
 * @param params.from - 開始年月 (YYYY-MM)
 * @param params.to   - 終了年月 (YYYY-MM)
 * @returns MonthlySummary[] — 月ごとの売上・利益・予定・達成率
 */
export const fetchMonthlySummary = (params?: { from?: string; to?: string }) =>
  api.get<MonthlySummary[]>('/reports/monthly-summary', { params }).then((r) => r.data);

/**
 * 2ヶ月のカテゴリ別売上・利益を比較する。
 * 両月を同時に指定する必要がある（どちらか省略不可）。
 *
 * @param month1 - 比較月1 (YYYY-MM)
 * @param month2 - 比較月2 (YYYY-MM)
 * @returns { month1, month2, data: MonthComparisonRow[] }
 */
export const fetchMonthComparison = (month1: string, month2: string) =>
  api
    .get<{ month1: string; month2: string; data: MonthComparisonRow[] }>('/reports/month-comparison', {
      params: { month1, month2 },
    })
    .then((r) => r.data);

/**
 * 指定年月のカテゴリ別 実績 vs 予定 を取得する。
 * 予定管理画面・ダッシュボードの両方で使用。
 * 実績がないカテゴリも予定があれば含まれる（LEFT JOIN）。
 *
 * @param year_month - 対象年月 (YYYY-MM)
 * @returns { year_month, data: ActualVsForecastRow[] }
 */
export const fetchActualVsForecast = (year_month: string) =>
  api
    .get<{ year_month: string; data: ActualVsForecastRow[] }>('/reports/actual-vs-forecast', {
      params: { year_month },
    })
    .then((r) => r.data);

/**
 * 月×カテゴリ×製品別の利益分析データを取得する。
 * 利益率トレンドグラフ用に月次集計して使用する。
 *
 * @param params.from        - 開始年月 (YYYY-MM)
 * @param params.to          - 終了年月 (YYYY-MM)
 * @param params.category_id - カテゴリで絞り込む（省略=全カテゴリ）
 * @param params.product_id  - 製品で絞り込む（省略=全製品）
 * @returns ProfitAnalysisRow[] — year_month × category × product の行
 */
export const fetchProfitAnalysis = (params?: {
  from?: string;
  to?: string;
  category_id?: number;
  product_id?: number;
}) => api.get<ProfitAnalysisRow[]>('/reports/profit-analysis', { params }).then((r) => r.data);

/**
 * 製品別の売上・利益ランキングを取得する。
 * product_id が NULL の売上（製品なし登録）は除外される。
 *
 * @param params.from        - 開始年月 (YYYY-MM)
 * @param params.to          - 終了年月 (YYYY-MM)
 * @param params.category_id - カテゴリで絞り込む（省略=全カテゴリ）
 * @param params.limit       - 取得件数上限（省略=全件）
 * @returns ProductRankingRow[] — 売上合計の降順
 */
export const fetchProductRanking = (params?: {
  from?: string;
  to?: string;
  category_id?: number;
  limit?: number;
}) => api.get<ProductRankingRow[]>('/reports/product-ranking', { params }).then((r) => r.data);
