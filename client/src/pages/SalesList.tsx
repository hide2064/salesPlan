/**
 * @file SalesList.tsx
 * @description 売上一覧ページ
 *
 * ## タブ構成
 * - 日付ベース: 売上明細を列ソート可能な一覧で表示（フィルタ・ページネーション付き）
 * - 部署ベース: 部署・課単位でソートした明細を表示
 *
 * ## ソート
 * 各列ヘッダーをクリックして昇順/降順を切り替え可能。
 * 部署ベースタブは部署→課の複合ソートが初期状態。
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { fetchSales, deleteSale } from '../api/sales';
import { fetchCategories } from '../api/categories';
import { fetchProducts } from '../api/products';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { formatCurrency, formatPercent, formatDate, currentYearMonth, exportCsv } from '../utils/formatters';

type ActiveTab = 'date' | 'department';
type SortDir = 'asc' | 'desc';

// ─── ソート可能な列ヘッダー ────────────────────────────────────────
function SortHeader({
  col, label, align = 'left', sortBy, sortDir, onSort,
}: {
  col: string; label: string; align?: 'left' | 'right';
  sortBy: string; sortDir: SortDir; onSort: (col: string) => void;
}) {
  const active = sortBy === col;
  return (
    <th
      className={`p-2 cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap text-${align}`}
      onClick={() => onSort(col)}
    >
      {label}
      <span className="ml-1 text-xs">
        {active ? (sortDir === 'asc' ? '▲' : '▼') : <span className="text-gray-300">⇅</span>}
      </span>
    </th>
  );
}

// ─── メインページ ─────────────────────────────────────────────────
export default function SalesList() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('date');

  // 日付ベースのフィルタ・ソート状態
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [categoryId, setCategoryId] = useState('');
  const [productId, setProductId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [department, setDepartment] = useState('');
  const [section, setSection] = useState('');
  const [page, setPage] = useState(1);
  const [dateSortBy, setDateSortBy]   = useState('sale_date');
  const [dateSortDir, setDateSortDir] = useState<SortDir>('desc');

  // 部署ベースのフィルタ・ソート状態（初期: 部署→課 昇順）
  const [deptPage, setDeptPage] = useState(1);
  const [deptFilterDept, setDeptFilterDept]       = useState('');
  const [deptFilterSection, setDeptFilterSection] = useState('');
  const [deptSortBy, setDeptSortBy]   = useState('department');
  const [deptSortDir, setDeptSortDir] = useState<SortDir>('asc');

  const limit = 50;
  const qc = useQueryClient();

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  const { data: products }   = useQuery({ queryKey: ['products'],   queryFn: () => fetchProducts() });

  // 日付ベース: 売上明細一覧
  const { data, isLoading } = useQuery({
    queryKey: ['sales', { yearMonth, categoryId, productId, customerName, department, section,
                          dateSortBy, dateSortDir, page }],
    queryFn: () => fetchSales({
      year_month:    yearMonth || undefined,
      category_id:   categoryId ? Number(categoryId) : undefined,
      product_id:    productId  ? Number(productId)  : undefined,
      customer_name: customerName || undefined,
      department:    department || undefined,
      section:       section || undefined,
      sort_by:       dateSortBy,
      sort_order:    dateSortDir,
      page,
      limit,
    }),
    enabled: activeTab === 'date',
  });

  // 部署ベース: 部署・課フィルタ付き売上明細
  const { data: deptData, isLoading: deptLoading } = useQuery({
    queryKey: ['sales-dept-detail', { yearMonth, deptFilterDept, deptFilterSection,
                                      deptSortBy, deptSortDir, deptPage }],
    queryFn: () => fetchSales({
      year_month: yearMonth || undefined,
      department: deptFilterDept    || undefined,
      section:    deptFilterSection || undefined,
      sort_by:    deptSortBy,
      sort_order: deptSortDir,
      page:       deptPage,
      limit,
    }),
    enabled: activeTab === 'department',
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSale,
    onSuccess: () => { toast.success('削除しました'); qc.invalidateQueries({ queryKey: ['sales'] }); },
    onError:   (e: Error) => toast.error(e.message),
  });

  // ソートハンドラ: 同じ列をクリックで方向反転、別列なら昇順に
  const handleDateSort = (col: string) => {
    if (dateSortBy === col) setDateSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setDateSortBy(col); setDateSortDir('asc'); }
    setPage(1);
  };

  const handleDeptSort = (col: string) => {
    if (deptSortBy === col) setDeptSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setDeptSortBy(col); setDeptSortDir('asc'); }
    setDeptPage(1);
  };

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
      ['部署', '課', '製品名', '売上原価', '売上数', '売上高'],
      deptData.data.map((s) => [
        s.department ?? '', s.section ?? '', s.product_name ?? '',
        s.cost_amount ?? '', s.quantity, s.amount,
      ]),
      `sales_by_dept_${yearMonth || 'all'}.csv`
    );
  };

  const totalPages     = data     ? Math.ceil(data.total     / limit) : 0;
  const deptTotalPages = deptData ? Math.ceil(deptData.total / limit) : 0;

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
                onChange={(e) => { setYearMonth(e.target.value); setPage(1); }}
                className="border rounded px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">カテゴリ</label>
              <select value={categoryId}
                onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
                className="border rounded px-2 py-1 text-sm">
                <option value="">全て</option>
                {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">製品</label>
              <select value={productId}
                onChange={(e) => { setProductId(e.target.value); setPage(1); }}
                className="border rounded px-2 py-1 text-sm">
                <option value="">全て</option>
                {products?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">顧客名</label>
              <input type="text" value={customerName}
                onChange={(e) => { setCustomerName(e.target.value); setPage(1); }}
                className="border rounded px-2 py-1 text-sm" placeholder="部分一致" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">部署</label>
              <input type="text" value={department}
                onChange={(e) => { setDepartment(e.target.value); setPage(1); }}
                className="border rounded px-2 py-1 text-sm" placeholder="部分一致" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">課</label>
              <input type="text" value={section}
                onChange={(e) => { setSection(e.target.value); setPage(1); }}
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
                      <SortHeader col="sale_date"     label="日付"     sortBy={dateSortBy} sortDir={dateSortDir} onSort={handleDateSort} />
                      <SortHeader col="category_name" label="カテゴリ" sortBy={dateSortBy} sortDir={dateSortDir} onSort={handleDateSort} />
                      <SortHeader col="product_name"  label="製品"     sortBy={dateSortBy} sortDir={dateSortDir} onSort={handleDateSort} />
                      <SortHeader col="customer_name" label="顧客名"   sortBy={dateSortBy} sortDir={dateSortDir} onSort={handleDateSort} />
                      <SortHeader col="department"    label="部署"     sortBy={dateSortBy} sortDir={dateSortDir} onSort={handleDateSort} />
                      <SortHeader col="section"       label="課"       sortBy={dateSortBy} sortDir={dateSortDir} onSort={handleDateSort} />
                      <SortHeader col="quantity"      label="数量"     align="right" sortBy={dateSortBy} sortDir={dateSortDir} onSort={handleDateSort} />
                      <SortHeader col="unit_price"    label="販売単価" align="right" sortBy={dateSortBy} sortDir={dateSortDir} onSort={handleDateSort} />
                      <SortHeader col="cost_price"    label="原価単価" align="right" sortBy={dateSortBy} sortDir={dateSortDir} onSort={handleDateSort} />
                      <SortHeader col="amount"        label="売上"     align="right" sortBy={dateSortBy} sortDir={dateSortDir} onSort={handleDateSort} />
                      <SortHeader col="profit_amount" label="利益"     align="right" sortBy={dateSortBy} sortDir={dateSortDir} onSort={handleDateSort} />
                      <SortHeader col="profit_rate"   label="利益率"   align="right" sortBy={dateSortBy} sortDir={dateSortDir} onSort={handleDateSort} />
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
          {/* フィルタ */}
          <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">年月</label>
              <input type="month" value={yearMonth}
                onChange={(e) => { setYearMonth(e.target.value); setDeptPage(1); }}
                className="border rounded px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">部署</label>
              <input type="text" value={deptFilterDept}
                onChange={(e) => { setDeptFilterDept(e.target.value); setDeptPage(1); }}
                className="border rounded px-2 py-1 text-sm" placeholder="部分一致" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">課</label>
              <input type="text" value={deptFilterSection}
                onChange={(e) => { setDeptFilterSection(e.target.value); setDeptPage(1); }}
                className="border rounded px-2 py-1 text-sm" placeholder="部分一致" />
            </div>
          </div>

          {deptLoading ? <LoadingSpinner /> : (
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="px-4 py-2 text-xs text-gray-500 border-b">
                全 {deptData?.total ?? 0} 件 (ページ {deptPage}/{deptTotalPages})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600 text-xs">
                      <SortHeader col="department"   label="部署"     sortBy={deptSortBy} sortDir={deptSortDir} onSort={handleDeptSort} />
                      <SortHeader col="section"      label="課"       sortBy={deptSortBy} sortDir={deptSortDir} onSort={handleDeptSort} />
                      <SortHeader col="product_name" label="製品名"   sortBy={deptSortBy} sortDir={deptSortDir} onSort={handleDeptSort} />
                      <SortHeader col="cost_amount"  label="売上原価" align="right" sortBy={deptSortBy} sortDir={deptSortDir} onSort={handleDeptSort} />
                      <SortHeader col="quantity"     label="売上数"   align="right" sortBy={deptSortBy} sortDir={deptSortDir} onSort={handleDeptSort} />
                      <SortHeader col="amount"       label="売上高"   align="right" sortBy={deptSortBy} sortDir={deptSortDir} onSort={handleDeptSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {deptData?.data.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-8 text-gray-400">データがありません</td></tr>
                    )}
                    {deptData?.data.map((s) => (
                      <tr key={s.id} className="border-t hover:bg-gray-50">
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
                        <td className="p-2">{s.product_name ?? '-'}</td>
                        <td className="p-2 text-right text-gray-500">
                          {s.cost_amount != null ? formatCurrency(s.cost_amount) : '-'}
                        </td>
                        <td className="p-2 text-right">{s.quantity}</td>
                        <td className="p-2 text-right font-medium">{formatCurrency(s.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {deptTotalPages > 1 && (
                <div className="flex justify-center gap-2 p-3 border-t">
                  <button onClick={() => setDeptPage(p => Math.max(1, p - 1))} disabled={deptPage === 1}
                    className="px-3 py-1 border rounded text-sm disabled:opacity-40">前へ</button>
                  <span className="px-3 py-1 text-sm">{deptPage} / {deptTotalPages}</span>
                  <button onClick={() => setDeptPage(p => Math.min(deptTotalPages, p + 1))} disabled={deptPage === deptTotalPages}
                    className="px-3 py-1 border rounded text-sm disabled:opacity-40">次へ</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
