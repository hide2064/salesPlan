import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { fetchMonthComparison } from '../api/reports';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { formatCurrency, formatPercent, formatYearMonth, currentYearMonth, prevYearMonth } from '../utils/formatters';

export default function Comparison() {
  const thisMonth = currentYearMonth();
  const [month1, setMonth1] = useState(prevYearMonth(thisMonth));
  const [month2, setMonth2] = useState(thisMonth);

  const { data, isLoading } = useQuery({
    queryKey: ['month-comparison', month1, month2],
    queryFn: () => fetchMonthComparison(month1, month2),
    enabled: !!month1 && !!month2 && month1 !== month2,
  });

  const chartData = data?.data.map((r) => ({
    name: r.category_name,
    [`${formatYearMonth(month1)} 売上`]: r.amount1,
    [`${formatYearMonth(month2)} 売上`]: r.amount2,
    [`${formatYearMonth(month1)} 利益`]: r.profit1,
    [`${formatYearMonth(month2)} 利益`]: r.profit2,
  }));

  const totals = data?.data.reduce(
    (acc, r) => ({
      amount1: acc.amount1 + r.amount1,
      amount2: acc.amount2 + r.amount2,
      profit1: acc.profit1 + r.profit1,
      profit2: acc.profit2 + r.profit2,
    }),
    { amount1: 0, amount2: 0, profit1: 0, profit2: 0 }
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800">月別比較</h1>

      <div className="flex gap-4 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">比較月 1</label>
          <input type="month" value={month1} onChange={(e) => setMonth1(e.target.value)}
            className="border rounded px-3 py-2 text-sm" />
        </div>
        <div className="text-gray-400 pb-2">vs</div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">比較月 2</label>
          <input type="month" value={month2} onChange={(e) => setMonth2(e.target.value)}
            className="border rounded px-3 py-2 text-sm" />
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : !data ? null : (
        <>
          {/* サマリ */}
          {totals && (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: '売上合計', v1: totals.amount1, v2: totals.amount2 },
                { label: '利益合計', v1: totals.profit1, v2: totals.profit2 },
              ].map(({ label, v1, v2 }) => {
                const diff = v2 - v1;
                const rate = v1 > 0 ? ((v2 - v1) / v1) * 100 : null;
                return (
                  <div key={label} className="bg-white rounded-lg shadow-sm p-4">
                    <p className="text-xs text-gray-500 mb-1">{label}</p>
                    <div className="flex justify-between items-end">
                      <div className="text-sm text-gray-500">{formatYearMonth(month1)}: {formatCurrency(v1)}</div>
                      <div className="text-sm font-bold">{formatYearMonth(month2)}: {formatCurrency(v2)}</div>
                    </div>
                    <div className={`text-sm font-semibold mt-1 ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {diff >= 0 ? '+' : ''}{formatCurrency(diff)} ({formatPercent(rate)})
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* グラフ */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">カテゴリ別 売上比較</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <Bar dataKey={`${formatYearMonth(month1)} 売上`} fill="#93c5fd" />
                <Bar dataKey={`${formatYearMonth(month2)} 売上`} fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 詳細テーブル */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-xs">
                  <th className="text-left p-3">カテゴリ</th>
                  <th className="text-right p-3">{formatYearMonth(month1)} 売上</th>
                  <th className="text-right p-3">{formatYearMonth(month2)} 売上</th>
                  <th className="text-right p-3">増減額</th>
                  <th className="text-right p-3">増減率</th>
                  <th className="text-right p-3">{formatYearMonth(month1)} 利益率</th>
                  <th className="text-right p-3">{formatYearMonth(month2)} 利益率</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => (
                  <tr key={row.category_id} className="border-t hover:bg-gray-50">
                    <td className="p-3 font-medium">{row.category_name}</td>
                    <td className="p-3 text-right">{formatCurrency(row.amount1)}</td>
                    <td className="p-3 text-right font-medium">{formatCurrency(row.amount2)}</td>
                    <td className={`p-3 text-right font-semibold ${row.diff_amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {row.diff_amount >= 0 ? '+' : ''}{formatCurrency(row.diff_amount)}
                    </td>
                    <td className={`p-3 text-right ${(row.diff_rate ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {row.diff_rate != null ? `${row.diff_rate >= 0 ? '+' : ''}${row.diff_rate.toFixed(1)}%` : '-'}
                    </td>
                    <td className="p-3 text-right">{formatPercent(row.profit_rate1)}</td>
                    <td className="p-3 text-right">{formatPercent(row.profit_rate2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
