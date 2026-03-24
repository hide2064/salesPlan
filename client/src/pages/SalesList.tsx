/**
 * @file SalesList.tsx
 * @description 売上一覧ページ
 *
 * ## 機能
 * - 売上一覧の絞り込み表示（年月・カテゴリ・製品・顧客名）
 * - ページネーション（1ページ50件）
 * - CSV出力（現在のフィルタ結果をエクスポート）
 * - 売上の削除（確認ダイアログ付き）
 *
 * ## フィルタの状態管理
 * フィルタ変更時は setPage(1) でページを先頭に戻す。
 * queryKey に全フィルタ値を含めることで、
 * 変更があれば自動的に再フェッチが走る。
 *
 * ## CSV出力の仕様
 * サーバーへの追加リクエストなし。
 * 現在のページデータ（data.data）をそのまま exportCsv() に渡す。
 * ページをまたいだ全件出力には /api/export/sales を使用する。
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { fetchSales, deleteSale } from '../api/sales';
import { fetchCategories } from '../api/categories';
import { fetchProducts } from '../api/products';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { formatCurrency, formatPercent, formatDate, currentYearMonth, exportCsv } from '../utils/formatters';

/**
 * 売上一覧ページコンポーネント。
 * 全ロールがアクセス可能（閲覧のみ）。削除は write 権限が必要だが、
 * ここではロール確認なし（APIサーバー側で弾く）。
 */
export default function SalesList() {
  // フィルタ状態
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [categoryId, setCategoryId] = useState('');
  const [productId, setProductId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50; // 1ページあたり件数（固定）

  const qc = useQueryClient();
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  // 製品フィルタ: カテゴリを問わず全製品を取得（絞り込みのため）
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => fetchProducts() });

  // 売上一覧取得（フィルタ・ページ変更で自動再フェッチ）
  const { data, isLoading } = useQuery({
    queryKey: ['sales', { yearMonth, categoryId, productId, customerName, page }],
    queryFn: () => fetchSales({
      year_month: yearMonth || undefined,
      category_id: categoryId ? Number(categoryId) : undefined,
      product_id: productId ? Number(productId) : undefined,
      customer_name: customerName || undefined,
      page,
      limit,
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSale,
    onSuccess: () => { toast.success('削除しました'); qc.invalidateQueries({ queryKey: ['sales'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  /** 削除確認ダイアログを表示してから削除を実行する */
  const handleDelete = (id: number) => {
    if (!confirm('削除しますか？')) return;
    deleteMutation.mutate(id);
  };

  /**
   * 現在のページデータをCSVとしてダウンロードする。
   * ページング対応の全件エクスポートは別途 /api/export/sales を使用。
   */
  const handleExport = () => {
    if (!data) return;
    exportCsv(
      ['日付', 'カテゴリ', '製品', '顧客名', '数量', '販売単価', '原価単価', '売上', '原価', '利益', '利益率', '備考'],
      data.data.map((s) => [
        formatDate(s.sale_date), s.category_name, s.product_name ?? '', s.customer_name ?? '',
        s.quantity, s.unit_price, s.cost_price ?? '', s.amount, s.cost_amount ?? '',
        s.profit_amount, s.profit_rate ?? '', s.description ?? '',
      ]),
      `sales_${yearMonth || 'all'}.csv`
    );
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">売上一覧</h1>
        <button onClick={handleExport} className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700">
          CSV出力
        </button>
      </div>

      {/* 絞り込みフィルタ: 変更でページが1にリセットされる */}
      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">年月</label>
          <input type="month" value={yearMonth} onChange={(e) => { setYearMonth(e.target.value); setPage(1); }}
            className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">カテゴリ</label>
          <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
            className="border rounded px-2 py-1 text-sm">
            <option value="">全て</option>
            {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">製品</label>
          <select value={productId} onChange={(e) => { setProductId(e.target.value); setPage(1); }}
            className="border rounded px-2 py-1 text-sm">
            <option value="">全て</option>
            {products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">顧客名</label>
          <input type="text" value={customerName} onChange={(e) => { setCustomerName(e.target.value); setPage(1); }}
            className="border rounded px-2 py-1 text-sm" placeholder="部分一致" />
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {/* 件数・ページ情報 */}
          <div className="px-4 py-2 text-xs text-gray-500 border-b">
            全 {data?.total ?? 0} 件 (ページ {page}/{totalPages})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-xs">
                  <th className="text-left p-2">日付</th>
                  <th className="text-left p-2">カテゴリ</th>
                  <th className="text-left p-2">製品</th>
                  <th className="text-left p-2">顧客名</th>
                  <th className="text-right p-2">数量</th>
                  <th className="text-right p-2">販売単価</th>
                  <th className="text-right p-2">原価単価</th>
                  <th className="text-right p-2">売上</th>
                  <th className="text-right p-2">利益</th>
                  <th className="text-right p-2">利益率</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {data?.data.length === 0 && (
                  <tr><td colSpan={11} className="text-center py-8 text-gray-400">データがありません</td></tr>
                )}
                {data?.data.map((s) => (
                  <tr key={s.id} className="border-t hover:bg-gray-50">
                    <td className="p-2">{formatDate(s.sale_date)}</td>
                    <td className="p-2">{s.category_name}</td>
                    <td className="p-2">{s.product_name ?? '-'}</td>
                    <td className="p-2">{s.customer_name ?? '-'}</td>
                    <td className="p-2 text-right">{s.quantity}</td>
                    <td className="p-2 text-right">{formatCurrency(s.unit_price)}</td>
                    <td className="p-2 text-right">{s.cost_price != null ? formatCurrency(s.cost_price) : '-'}</td>
                    <td className="p-2 text-right font-medium">{formatCurrency(s.amount)}</td>
                    {/* 利益: 黒字=緑、赤字=赤で色分け */}
                    <td className={`p-2 text-right ${s.profit_amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(s.profit_amount)}
                    </td>
                    <td className="p-2 text-right">{formatPercent(s.profit_rate)}</td>
                    <td className="p-2">
                      <button onClick={() => handleDelete(s.id)}
                        className="text-red-500 hover:text-red-700 text-xs">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ページネーション: 2ページ以上の場合のみ表示 */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 p-3 border-t">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 border rounded text-sm disabled:opacity-40">前へ</button>
              <span className="px-3 py-1 text-sm">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1 border rounded text-sm disabled:opacity-40">次へ</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
