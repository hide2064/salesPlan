/**
 * @file forecasts.ts
 * @description 予定売上APIコール関数
 *
 * ## Upsertパターン
 * upsertForecast は POST /api/forecasts を呼ぶが、
 * サーバー側は `INSERT ... ON DUPLICATE KEY UPDATE` で動作する。
 * year_month × category_id の組み合わせが既存なら更新、新規なら挿入される。
 * これにより「存在確認→INSERT/UPDATE 分岐」が不要で、常に upsert を呼べばよい。
 *
 * ## forecast_cost_rate の単位
 * DBには 0〜1 の小数で保存（例: 20% = 0.20）。
 * UIでは % 表示するため、入力値は /100 してから送信し、取得値は *100 して表示する。
 */

import api from './client';
import type { Forecast } from '../types';

/**
 * 予定売上一覧を取得する。
 *
 * @param params.year_month - 特定年月で絞り込む (YYYY-MM)
 * @param params.from       - 開始年月 (YYYY-MM)
 * @param params.to         - 終了年月 (YYYY-MM)
 * @returns Forecast[] — 予定データの配列
 */
export const fetchForecasts = (params?: { year_month?: string; from?: string; to?: string }) =>
  api.get<Forecast[]>('/forecasts', { params }).then((r) => r.data);

/**
 * 予定売上を登録または更新する（Upsert）。
 * year_month × category_id で既存レコードを判定する。
 *
 * @param data - 予定データ（year_month と category_id は必須）
 * @returns 登録/更新後の Forecast レコード
 */
export const upsertForecast = (data: Partial<Forecast>) =>
  api.post<Forecast>('/forecasts', data).then((r) => r.data);

/**
 * 予定売上をIDで更新する。
 *
 * @param id   - 更新対象予定ID
 * @param data - 更新フィールド（部分更新可）
 * @returns 更新後の Forecast レコード
 */
export const updateForecast = (id: number, data: Partial<Forecast>) =>
  api.put<Forecast>(`/forecasts/${id}`, data).then((r) => r.data);

/**
 * 予定売上を削除する（物理削除）。
 *
 * @param id - 削除対象予定ID
 */
export const deleteForecast = (id: number) =>
  api.delete(`/forecasts/${id}`);
