/**
 * @file SalesList.tsx
 * @description 売上一覧ページ
 *
 * ## タブ構成
 * - 日付ベース: 売上明細を日付降順で一覧表示（フィルタ・ページネーション付き）
 * - 部署ベース: 部署ごとの売上・利益を集計して表示
 *
 * ## フィルタ
 * 日付ベース: 年月・カテゴリ・製品・顧客名・部署で絞り込み
 * 部署ベース: 年月で絞り込み（部署ごとに自動集計）
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { fetchSales, deleteSale, fetchSalesByDepartment } from '../api/sales';
import { fetchCategories } from '../api/categories';
import { fetchProducts } from '../api/products';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { formatCurrency, formatPercent, formatDate, currentYearMonth, exportCsv } from '../utils/formatters';

type ActiveTab = 'date' | 'department';

export default function SalesList() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('date');

  // 日付ベースのフィルタ状態
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [categoryId, setCategoryId] = useState('');
  const [productId, setProductId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [department, setDepartment] = useState('');
  const [section, setSection] = useState('');
  const [page, setPage] = useState(1);
  const limit = 50;

  const qc = useQueryClient();
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  const { data: products } = useQuery({ queryKey: ['products'], queryFn: () => fetchProducts() });

  // 日付ベース: 売上明細一覧
  const { data, isLoading } = useQuery({
    queryKey: ['sales', { yearMonth, categoryId, productId, customerName, department, section, page }],
    queryFn: () => fetchSales({
      year_month:    yearMonth || undefined,
      category_id:   categoryId ? Number(categoryId) : undefined,
      product_id:    productId  ? Number(productId)  : undefined,
      customer_name: customerName || undefined,
      department:    department || undefined,
      section:       section || undefined,
      page,
      limit,
    }),
    enabled: activeTab === 'date',
  });

  // 部署ベース: 部署別集計
  const { data: deptData, isLoading: deptLoading } = useQuery({
    queryKey: ['sales-by-department', yearMonth],
    queryFn: () => fetchSalesByDepartment({ year_month: yearMonth || undefined }),
    enabled: activeTab === 'department',
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSale,
    onSuccess: () => { toast.success('削除しました'); qc.invalidateQueries({ queryKey: ['sales'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDelete = (id: number) => {
    if (!confirm('削除しますか？')) return;
    deleteMutation.mutate(id);
  };

  const handleExport = () => {
    if (!data) return;
    exportCsv(
      ['日付', 'カテゴリ', '製品', '顧客名', '部署', '課', '数量', '販売単価', '原価単価', '売上', '原価', '利益', '利益率', '備考'],
      data.data.map((s) => [
        formatDate(s.sale_date), s.category_name, s.product_name ?? '', s.customer_name ?? '',
        s.department ?? '', s.section ?? '', s.quantity, s.unit_price, s.cost_price ?? '',
        s.amount, s.cost_amount ?? '', s.profit_amount, s.profit_rate ?? '', s.description ?? '',
      ]),
      `sales_${yearMonth || 'all'}.csv`
    );
  };

  const handleDeptExport = () => {
    if (!deptData) return;
    exportCsv(
      ['部署', '課', '件数', '売上合計', '原価合計', '利益合計', '利益率'],
      deptData.map((r) => [r.department, r.section, r.sales_count, r.total_amount, r.total_cost, r.total_profit, `${r.profit_rate}%`]),
      `sales_by_dept_${yearMonth || 'all'}.csv`
    );
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  const resetPage = () => setPage(1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">売上一覧</h1>
        <button
          onClick={activeTab === 'date' ? handleExport : handleDeptExport}
          className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700"
        >
          CSV出力
        </button>
      </div>

      {/* タブ切り替え */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px">
          {([
            { key: 'date',       label: '日付ベース' },
            { key: 'department', label: '部署ベース' },
          ] as { key: ActiveTab; label: string }[]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── 日付ベース ─────────────────────────────────────────── */}
      {activeTab === 'date' && (
        <>
          {/* フィルタ */}
          <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">年月</label>
              <input type="month" value={yearMonth}
                onChange={(e) => { setYearMonth(e.target.value); resetPage(); }}
                className="border rounded px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">カテゴリ</label>
              <select value={categoryId}
                onChange={(e) => { setCategoryId(e.target.value); resetPage(); }}
                className="border rounded px-2 py-1 text-sm">
                <option value="">全て</option>
                {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">製品</label>
              <select value={productId}
                onChange={(e) => { setProductId(e.target.value); resetPage(); }}
                className="border rounded px-2 py-1 text-sm">
                <option value="">全て</option>
                {products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">顧客名</label>
              <input type="text" value={customerName}
                onChange={(e) => { setCustomerName(e.target.value); resetPage(); }}
                className="border rounded px-2 py-1 text-sm" placeholder="部分一致" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">部署</label>
              <input type="text" value={department}
                onChange={(e) => { setDepartment(e.target.value); resetPage(); }}
                className="border rounded px-2 py-1 text-sm" placeholder="部分一致" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">課</label>
              <input type="text" value={section}
                onChange={(e) => { setSection(e.target.value); resetPage(); }}
                className="border rounded px-2 py-1 text-sm" placeholder="部分一致" />
            </div>
          </div>

          {isLoading ? <LoadingSpinner /> : (
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
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
                      <th className="text-left p-2">部署</th>
                      <th className="text-left p-2">課</th>
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
                      <tr><td colSpan={13} className="text-center py-8 text-gray-400">データがありません</td></tr>
                    )}
                    {data?.data.map((s) => (
                      <tr key={s.id} className="border-t hover:bg-gray-50">
                        <td className="p-2">{formatDate(s.sale_date)}</td>
                        <td className="p-2">{s.category_name}</td>
                        <td className="p-2">{s.product_name ?? '-'}</td>
                        <td className="p-2">{s.customer_name ?? '-'}</td>
                        <td className="p-2">
                          {s.department
                            ? <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-xs">{s.department}</span>
                            : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="p-2">
                          {s.section
                            ? <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded text-xs">{s.section}</span>
                            : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="p-2 text-right">{s.quantity}</td>
                        <td className="p-2 text-right">{formatCurrency(s.unit_price)}</td>
                        <td className="p-2 text-right">{s.cost_price != null ? formatCurrency(s.cost_price) : '-'}</td>
                        <td className="p-2 text-right font-medium">{formatCurrency(s.amount)}</td>
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
        </>
      )}

      {/* ── 部署ベース ─────────────────────────────────────────── */}
      {activeTab === 'department' && (
        <>
          {/* フィルタ（年月のみ） */}
          <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">年月</label>
              <input type="month" value={yearMonth}
                onChange={(e) => setYearMonth(e.target.value)}
                className="border rounded px-2 py-1 text-sm" />
            </div>
          </div>

          {deptLoading ? <LoadingSpinner /> : (
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="px-4 py-2 text-xs text-gray-500 border-b">
                部署数: {deptData?.length ?? 0}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600 text-xs">
                      <th className="text-left p-3">部署</th>
                      <th className="text-left p-3">課</th>
                      <th className="text-right p-3">件数</th>
                      <th className="text-right p-3">売上合計</th>
                      <th className="text-right p-3">原価合計</th>
                      <th className="text-right p-3">利益合計</th>
                      <th className="text-right p-3">利益率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deptData?.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-8 text-gray-400">データがありません</td></tr>
                    )}
                    {deptData?.map((r) => (
                      <tr key={`${r.department}-${r.section}`} className="border-t hover:bg-gray-50">
                        <td className="p-3 font-medium">
                          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs">{r.department}</span>
                        </td>
                        <td className="p-3">
                          <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-xs">{r.section}</span>
                        </td>
                        <td className="p-3 text-right text-gray-600">{r.sales_count} 件</td>
                        <td className="p-3 text-right font-medium">{formatCurrency(r.total_amount)}</td>
                        <td className="p-3 text-right text-gray-500">{formatCurrency(r.total_cost)}</td>
                        <td className={`p-3 text-right font-medium ${r.total_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(r.total_profit)}
                        </td>
                        <td className="p-3 text-right">{formatPercent(r.profit_rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {deptData && deptData.length > 0 && (() => {
                    const totAmount  = deptData.reduce((s, r) => s + r.total_amount,  0);
                    const totCost    = deptData.reduce((s, r) => s + r.total_cost,    0);
                    const totProfit  = deptData.reduce((s, r) => s + r.total_profit,  0);
                    const totRate    = totAmount > 0 ? (totProfit / totAmount) * 100 : 0;
                    const totCount   = deptData.reduce((s, r) => s + r.sales_count,   0);
                    return (
                      <tfoot>
                        <tr className="bg-gray-100 font-semibold text-sm border-t-2 border-gray-300">
                          <td className="p-3" colSpan={2}>合計</td>
                          <td className="p-3 text-right">{totCount} 件</td>
                          <td className="p-3 text-right">{formatCurrency(totAmount)}</td>
                          <td className="p-3 text-right">{formatCurrency(totCost)}</td>
                          <td className={`p-3 text-right ${totProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(totProfit)}
                          </td>
                          <td className="p-3 text-right">{formatPercent(totRate)}</td>
                        </tr>
                      </tfoot>
                    );
                  })()}
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
