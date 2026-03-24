/**
 * @file ForecastManagement.tsx
 * @description 予定売上管理ページ
 *
 * ## 機能
 * - カテゴリ別の予定売上金額・予定原価率の入力・保存
 * - 実績 vs 予定の比較表示（同一テーブルで確認可能）
 * - 前月コピー機能（前月の予定値を当月の編集状態に展開）
 *
 * ## Upsert パターン
 * 「保存」ボタンは POST /api/forecasts を呼ぶ（upsertForecast）。
 * サーバーは INSERT ... ON DUPLICATE KEY UPDATE を使用するため、
 * 既存レコードがあれば更新、なければ新規登録される。
 * 画面側は INSERT/UPDATE を意識しない。
 *
 * ## 編集状態の管理
 * editing: Record<categoryId, { amount: string, cost_rate: string }>
 * 各カテゴリの「編集」ボタンで editing に追加し、
 * 「保存」「取消」で editing から削除する。
 * 複数カテゴリを同時に編集中にできる。
 *
 * ## forecast_cost_rate の変換
 * DB: 0〜1（例: 20% = 0.20）
 * 入力: % 表示（例: 20）
 * 保存時: / 100 して API に送る
 * 表示時: * 100 して % 表示する
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { fetchForecasts, upsertForecast } from '../api/forecasts';
import { fetchCategories } from '../api/categories';
import { fetchActualVsForecast } from '../api/reports';
import { formatCurrency, formatPercent, formatYearMonth, currentYearMonth, prevYearMonth } from '../utils/formatters';

/**
 * 予定売上管理ページコンポーネント。
 * 各カテゴリの月次予定金額を管理し、実績との比較を同一画面で行う。
 */
export default function ForecastManagement() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  /**
   * 編集中のカテゴリとその入力値のマップ。
   * key: category_id, value: { amount: 文字列, cost_rate: 文字列(%) }
   */
  const [editing, setEditing] = useState<Record<number, { amount: string; cost_rate: string }>>({});
  const qc = useQueryClient();

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });

  // 実績 vs 予定データ（テーブル行の元データ）
  const { data: avf, isLoading } = useQuery({
    queryKey: ['actual-vs-forecast', yearMonth],
    queryFn: () => fetchActualVsForecast(yearMonth),
  });

  const mutation = useMutation({
    mutationFn: (data: { category_id: number; forecast_amount: number; forecast_cost_rate: number | null }) =>
      upsertForecast({ year_month: yearMonth, ...data }),
    onSuccess: () => {
      // 保存成功後: 実績 vs 予定・月次サマリのキャッシュを更新
      qc.invalidateQueries({ queryKey: ['actual-vs-forecast', yearMonth] });
      qc.invalidateQueries({ queryKey: ['monthly-summary'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** 指定カテゴリの編集状態を更新する */
  const handleEdit = (categoryId: number, amount: string, costRate: string) => {
    setEditing((prev) => ({ ...prev, [categoryId]: { amount, cost_rate: costRate } }));
  };

  /**
   * 指定カテゴリの編集値を保存する。
   * cost_rate は % 入力値を /100 して DB 保存用の 0〜1 に変換する。
   */
  const handleSave = async (categoryId: number) => {
    const e = editing[categoryId];
    if (!e) return;
    const amount = parseFloat(e.amount);
    if (isNaN(amount) || amount < 0) { toast.error('金額が不正です'); return; }
    // % 入力値を 0〜1 の小数に変換。空の場合は null（原価率未設定）
    const costRate = e.cost_rate !== '' ? parseFloat(e.cost_rate) / 100 : null;
    await mutation.mutateAsync({ category_id: categoryId, forecast_amount: amount, forecast_cost_rate: costRate });
    // 保存完了後に editing からこのカテゴリを削除（表示モードに戻す）
    setEditing((prev) => { const n = { ...prev }; delete n[categoryId]; return n; });
    toast.success('保存しました');
  };

  // 前月の予定データ（前月コピー機能用）
  const { data: prevForecasts } = useQuery({
    queryKey: ['forecasts', prevYearMonth(yearMonth)],
    queryFn: () => fetchForecasts({ year_month: prevYearMonth(yearMonth) }),
  });

  /**
   * 前月の予定値を当月の編集状態にコピーする。
   * 保存はしない（各行を確認後に個別に保存する）。
   */
  const handleCopyPrev = () => {
    if (!prevForecasts || prevForecasts.length === 0) { toast.error('前月の予定データがありません'); return; }
    const edits: Record<number, { amount: string; cost_rate: string }> = {};
    for (const f of prevForecasts) {
      edits[f.category_id] = {
        amount: String(f.forecast_amount),
        // DB の 0〜1 を % 表示用に *100 して文字列化
        cost_rate: f.forecast_cost_rate != null ? String(f.forecast_cost_rate * 100) : '',
      };
    }
    setEditing(edits);
    toast('前月の予定をコピーしました。各行を確認して保存してください。', { icon: 'ℹ️' });
  };

  const rows = avf?.data ?? [];
  const totalActual = rows.reduce((s, r) => s + r.actual_amount, 0);
  const totalForecast = rows.reduce((s, r) => s + (r.forecast_amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800">予定売上管理</h1>

      <div className="flex items-center gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">対象年月</label>
          {/* 年月変更時: 編集中の状態をリセット（編集中データの混在を防ぐ） */}
          <input type="month" value={yearMonth}
            onChange={(e) => { setYearMonth(e.target.value); setEditing({}); }}
            className="border rounded px-3 py-2 text-sm" />
        </div>
        <button onClick={handleCopyPrev}
          className="mt-5 bg-gray-100 text-gray-700 border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-200">
          前月コピー
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-xs">
              <th className="text-left p-3">カテゴリ</th>
              <th className="text-right p-3">予定売上</th>
              <th className="text-right p-3">予定原価率</th>
              <th className="text-right p-3">予定利益</th>
              <th className="text-right p-3">実績売上</th>
              <th className="text-right p-3">実績利益</th>
              <th className="text-right p-3">達成率</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const e = editing[row.category_id];
              const isEditing = !!e;
              // 予定利益 = 予定売上 * (1 - 予定原価率)
              const forecastProfit = row.forecast_amount
                ? row.forecast_amount * (1 - (row.forecast_cost_rate ?? 0))
                : null;

              return (
                <tr key={row.category_id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-medium">{row.category_name}</td>
                  <td className="p-3 text-right">
                    {isEditing ? (
                      // 編集中: インプットフィールドを表示
                      <input type="number" step="any" value={e.amount}
                        onChange={(ev) => handleEdit(row.category_id, ev.target.value, e.cost_rate)}
                        className="w-28 border rounded px-2 py-1 text-right text-xs" />
                    ) : formatCurrency(row.forecast_amount)}
                  </td>
                  <td className="p-3 text-right">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-1">
                        <input type="number" step="any" min="0" max="100" value={e.cost_rate}
                          onChange={(ev) => handleEdit(row.category_id, e.amount, ev.target.value)}
                          className="w-16 border rounded px-2 py-1 text-right text-xs" />
                        <span className="text-xs">%</span>
                      </div>
                    ) : (
                      // 表示時: DB値(0〜1)を *100 して % 表示
                      formatPercent(row.forecast_cost_rate != null ? row.forecast_cost_rate * 100 : null)
                    )}
                  </td>
                  <td className="p-3 text-right text-green-700">{formatCurrency(forecastProfit)}</td>
                  <td className="p-3 text-right">{formatCurrency(row.actual_amount)}</td>
                  <td className="p-3 text-right">{formatCurrency(row.actual_profit)}</td>
                  {/* 達成率の色分け: 100%以上=緑、80%以上=黄、80%未満=赤 */}
                  <td className={`p-3 text-right font-semibold ${
                    (row.achievement_rate ?? 0) >= 100 ? 'text-green-600' :
                    (row.achievement_rate ?? 0) >= 80  ? 'text-yellow-600' : 'text-red-600'
                  }`}>{formatPercent(row.achievement_rate)}</td>
                  <td className="p-3">
                    {isEditing ? (
                      <div className="flex gap-1">
                        <button onClick={() => handleSave(row.category_id)}
                          className="bg-blue-600 text-white px-2 py-1 rounded text-xs">保存</button>
                        {/* 取消: editing からこのカテゴリを削除して表示モードに戻す */}
                        <button onClick={() => setEditing((prev) => { const n = { ...prev }; delete n[row.category_id]; return n; })}
                          className="text-gray-500 px-2 py-1 rounded text-xs">取消</button>
                      </div>
                    ) : (
                      // 編集開始: 現在のDB値をediting状態にセット
                      <button onClick={() => handleEdit(
                        row.category_id,
                        String(row.forecast_amount ?? ''),
                        row.forecast_cost_rate != null ? String(row.forecast_cost_rate * 100) : ''
                      )} className="text-blue-600 text-xs hover:underline">編集</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* 合計行 */}
          <tfoot>
            <tr className="border-t bg-gray-50 font-semibold">
              <td className="p-3">合計</td>
              <td className="p-3 text-right">{formatCurrency(totalForecast)}</td>
              <td className="p-3"></td>
              <td className="p-3"></td>
              <td className="p-3 text-right">{formatCurrency(totalActual)}</td>
              <td className="p-3 text-right">
                {formatCurrency(rows.reduce((s, r) => s + r.actual_profit, 0))}
              </td>
              <td className="p-3 text-right">
                {/* 合計達成率: 全カテゴリの実績合計 / 予定合計 */}
                {formatPercent(totalForecast > 0 ? (totalActual / totalForecast) * 100 : null)}
              </td>
              <td className="p-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
