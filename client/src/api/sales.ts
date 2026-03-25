/**
 * @file sales.ts
 * @description 売上APIコール関数
 *
 * ## profit_amount / profit_rate について
 * これらはDBカラムに持たず、サーバー側で `amount - cost_amount` をSQLで計算して返す。
 * Sale 型には含まれているが、クライアントからの POST/PUT 時には送らない（サーバーが無視する）。
 *
 * ## ページネーション
 * fetchSales はページネーション対応。
 * SaleListResponse.total を使って全件数を把握し、page/limit でページ移動する。
 */

import api from './client';
import type { Sale, SaleListResponse, DepartmentSummary, SalesDeptProductRow } from '../types';

/**
 * 売上一覧フィルタ条件
 */
export interface SaleFilters {
  /** 絞り込む年月 (YYYY-MM) */
  year_month?: string;
  /** カテゴリID */
  category_id?: number;
  /** 製品ID */
  product_id?: number;
  /** 顧客名（部分一致） */
  customer_name?: string;
  /** 部署名（部分一致） */
  department?: string;
  /** 課名（部分一致） */
  section?: string;
  /** ページ番号（1始まり） */
  page?: number;
  /** 1ページあたりの件数 */
  limit?: number;
  /** ソートするカラム名 */
  sort_by?: string;
  /** ソート方向 */
  sort_order?: 'asc' | 'desc';
}

/**
 * 売上一覧を取得する（ページネーション対応）。
 *
 * @param filters - 絞り込み条件（省略可、デフォルト：全件）
 * @returns { data: Sale[], total: number, page: number, limit: number }
 */
export const fetchSales = (filters: SaleFilters = {}) =>
  api.get<SaleListResponse>('/sales', { params: filters }).then((r) => r.data);

/**
 * 売上を新規登録する。
 * year / month / year_month はサーバー側で sale_date から自動設定される。
 *
 * @param data - 売上データ（Saleの部分型）
 * @returns 作成された売上レコード（profit_amount等のDB計算値含む）
 */
export const createSale = (data: Partial<Sale>) =>
  api.post<Sale>('/sales', data).then((r) => r.data);

/**
 * 売上を更新する。
 *
 * @param id - 更新対象売上ID
 * @param data - 更新フィールド（部分更新可）
 * @returns 更新後の売上レコード
 */
export const updateSale = (id: number, data: Partial<Sale>) =>
  api.put<Sale>(`/sales/${id}`, data).then((r) => r.data);

/**
 * 売上を削除する（物理削除）。
 *
 * @param id - 削除対象売上ID
 */
export const deleteSale = (id: number) =>
  api.delete(`/sales/${id}`);

/**
 * 部署別売上集計を取得する。
 *
 * @param params.year_month - 対象年月 (YYYY-MM)
 * @param params.from       - 開始年月 (YYYY-MM)
 * @param params.to         - 終了年月 (YYYY-MM)
 * @returns DepartmentSummary[] — 部署ごとの売上合計・利益の降順
 */
export const fetchSalesByDepartment = (params: { year_month?: string; from?: string; to?: string }) =>
  api.get<DepartmentSummary[]>('/sales/by-department', { params }).then((r) => r.data);

/** 部署×課×製品×単価の集計一覧（部署タブ用）*/
export const fetchSalesDeptProductSummary = (params: {
  year_month?: string;
  department?: string;
  section?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}) =>
  api
    .get<{ data: SalesDeptProductRow[]; total: number; page: number; limit: number }>(
      '/sales/dept-product-summary', { params }
    )
    .then((r) => r.data);
