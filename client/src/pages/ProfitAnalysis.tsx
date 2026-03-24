import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';
import { fetchProductRanking, fetchProfitAnalysis } from '../api/reports';
import { fetchCategories } from '../api/categories';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { formatCurrency, formatPercent, formatYearMonth, currentYearMonth, prevYearMonth, last12Months } from '../utils/formatters';

export default function ProfitAnalysis() {
  const months = last12Months();
  const [from, setFrom] = useState(months[0]);
  const [to, setTo] = useState(currentYearMonth());
  const [categoryId, setCategoryId] = useState('');

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });

  const { data: ranking, isLoading: rankingLoading } = useQuery({
    queryKey: ['product-ranking', { from, to, categoryId }],
    queryFn: () => fetchProductRanking({ from, to, category_id: categoryId ? Number(categoryId) : undefined, limit: 20 }),
  });

  const { data: profitRows, isLoading: profitLoading } = useQuery({
    queryKey: ['profit-analysis', { from, to, categoryId }],
    queryFn: () => fetchProfitAnalysis({ from, to, category_id: categoryId ? Number(categoryId) : undefined }),
  });

  // 月次利益率推移（カテゴリ集計）
  const monthlyMap: Record<string, { month: string; amount: number; cost: number; profit: number }> = {};
  profitRows?.forEach((r) => {
    if (!monthlyMap[r.year_month]) monthlyMap[r.year_month] = { month: formatYearMonth(r.year_month), amount: 0, cost: 0, profit: 0 };
    monthlyMap[r.year_month].amount += r.total_amount;
    monthlyMap[r.year_month].cost += r.total_cost;
    monthlyMap[r.year_month].profit += r.total_profit;
  });
  const trendData = Object.values(monthlyMap)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => ({ ...r, profit_rate: r.amount > 0 ? Math.round((r.profit / r.amount) * 1000) / 10 : 0 }));

  const isLoading = rankingLoading || profitLoading;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800">利益分析</h1>

      {/* フィルタ */}
      <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">開始年月</label>
          <input type="month" value={from} onChange={(e) => setFrom(e.target.value)}
            className="border rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">終了年月</label>
          <input type="month" value={to} onChange={(e) => setTo(e.target.value)}
            className="border rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">カテゴリ</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            className="border rounded px-3 py-2 text-sm">
            <option value="">全て</option>
            {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <>
          {/* 利益率トレンド */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">月次 売上・利益推移</h2>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v: number, name: string) => name === '利益率' ? `${v}%` : formatCurrency(v)} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="amount" name="売上" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="profit" name="利益" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="profit_rate" name="利益率" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 製品別ランキング */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">製品別 売上・利益ランキング</h2>
            {(!ranking || ranking.length === 0) ? (
              <p className="text-sm text-gray-400 text-center py-4">製品が紐付いた売上データがありません</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={ranking.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                    <YAxis type="category" dataKey="product_name" tick={{ fontSize: 10 }} width={80} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                    <Bar dataKey="total_amount" name="売上" fill="#3b82f6" />
                    <Bar dataKey="total_profit" name="利益" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>

                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 text-xs">
                        <th className="text-center p-2">順位</th>
                        <th className="text-left p-2">製品名</th>
                        <th className="text-left p-2">カテゴリ</th>
                        <th className="text-right p-2">件数</th>
                        <th className="text-right p-2">数量</th>
                        <th className="text-right p-2">売上合計</th>
                        <th className="text-right p-2">利益合計</th>
                        <th className="text-right p-2">利益率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((r, i) => (
                        <tr key={r.product_id} className="border-t hover:bg-gray-50">
                          <td className="p-2 text-center text-gray-500">{i + 1}</td>
                          <td className="p-2 font-medium">{r.product_name}</td>
                          <td className="p-2 text-gray-500">{r.category_name}</td>
                          <td className="p-2 text-right">{r.sales_count}</td>
                          <td className="p-2 text-right">{r.total_quantity} {r.unit}</td>
                          <td className="p-2 text-right">{formatCurrency(r.total_amount)}</td>
                          <td className={`p-2 text-right ${r.total_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(r.total_profit)}
                          </td>
                          <td className="p-2 text-right">{formatPercent(r.profit_rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
