/**
 * @file Dashboard.tsx
 * @description ダッシュボードページ
 *
 * ## 表示内容
 * 1. KPIカード (8枚)
 *    - 当月売上・当月予定(forecast)・達成率・当月利益/利益率・前月比・当月件数
 *    - 当月予定案件(sale_plans pending)・転換率
 * 2. 過去12ヶ月推移グラフ（売上・forecast予定・予定案件・利益）
 * 3. 当月カテゴリ別 実績 vs 予定(forecast) テーブル
 * 4. 当月カテゴリ別 売上予定案件 テーブル
 */

import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  fetchMonthlySummary, fetchActualVsForecast,
  fetchSalePlansMonthlySummary, fetchSalePlansByCategory,
} from '../api/reports';
import KPICard from '../components/ui/KPICard';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import {
  formatCurrency, formatPercent, formatYearMonth,
  currentYearMonth, prevYearMonth, last12Months,
} from '../utils/formatters';

export default function Dashboard() {
  const months     = last12Months();
  const thisMonth  = currentYearMonth();
  const lastMonth  = prevYearMonth(thisMonth);

  // 月次サマリ（売上実績 + forecasts）
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['monthly-summary', months[0], months[11]],
    queryFn: () => fetchMonthlySummary({ from: months[0], to: months[11] }),
  });

  // 当月カテゴリ別 実績 vs 予定(forecast)
  const { data: avf } = useQuery({
    queryKey: ['actual-vs-forecast', thisMonth],
    queryFn: () => fetchActualVsForecast(thisMonth),
  });

  // 売上予定案件 月次集計（グラフ用）
  const { data: planMonthly } = useQuery({
    queryKey: ['sale-plans-monthly', months[0], months[11]],
    queryFn: () => fetchSalePlansMonthlySummary({ from: months[0], to: months[11] }),
  });

  // 当月カテゴリ別 売上予定案件
  const { data: planByCategory } = useQuery({
    queryKey: ['sale-plans-by-category', thisMonth],
    queryFn: () => fetchSalePlansByCategory(thisMonth),
  });

  if (summaryLoading) return <LoadingSpinner />;

  const thisMonthData = summary?.find((s) => s.year_month === thisMonth);
  const lastMonthData = summary?.find((s) => s.year_month === lastMonth);

  // 当月予定案件サマリ
  const thisPlan = planMonthly?.find((p) => p.year_month === thisMonth);
  const planConversionRate =
    thisPlan && thisPlan.total_count > 0
      ? (thisPlan.converted_count / thisPlan.total_count) * 100
      : null;

  // 前月比
  const momRate =
    lastMonthData && lastMonthData.total_amount > 0
      ? (((thisMonthData?.total_amount ?? 0) - lastMonthData.total_amount) / lastMonthData.total_amount) * 100
      : null;

  // planMonthly を Map 化
  const planMap: Record<string, typeof thisPlan> = {};
  for (const p of planMonthly ?? []) planMap[p.year_month] = p;

  // グラフ用データ（12ヶ月）
  const chartData = months.map((ym) => {
    const s = summary?.find((x) => x.year_month === ym);
    const p = planMap[ym];
    return {
      month:    formatYearMonth(ym),
      売上:     s?.total_amount   ?? 0,
      予定:     s?.total_forecast ?? 0,
      予定案件: (p?.pending_amount ?? 0) + (p?.converted_amount ?? 0),
      利益:     s?.total_profit   ?? 0,
    };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">ダッシュボード</h1>

      {/* ── KPIカード ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title={`当月売上 (${formatYearMonth(thisMonth)})`}
          value={formatCurrency(thisMonthData?.total_amount ?? 0)}
          color="blue"
        />
        <KPICard
          title="当月予定(forecast)"
          value={formatCurrency(thisMonthData?.total_forecast ?? 0)}
          color="gray"
        />
        <KPICard
          title="達成率"
          value={formatPercent(thisMonthData?.achievement_rate)}
          color={
            (thisMonthData?.achievement_rate ?? 0) >= 100 ? 'green' :
            (thisMonthData?.achievement_rate ?? 0) >= 80  ? 'yellow' : 'red'
          }
        />
        <KPICard
          title="当月利益 / 利益率"
          value={formatCurrency(thisMonthData?.total_profit ?? 0)}
          sub={`利益率 ${formatPercent(thisMonthData?.profit_rate)}`}
          color="green"
        />
        <KPICard
          title="前月比"
          value={momRate != null ? `${momRate >= 0 ? '+' : ''}${momRate.toFixed(1)}%` : '-'}
          color={momRate == null ? 'gray' : momRate >= 0 ? 'green' : 'red'}
        />
        <KPICard
          title="当月件数"
          value={`${thisMonthData?.sales_count ?? 0} 件`}
          color="gray"
        />
        {/* 売上予定案件 KPI */}
        <KPICard
          title="当月予定案件 (未転換)"
          value={formatCurrency(thisPlan?.pending_amount ?? 0)}
          sub={`${thisPlan?.pending_count ?? 0} 件`}
          color="yellow"
        />
        <KPICard
          title="転換率"
          value={planConversionRate != null ? `${planConversionRate.toFixed(1)}%` : '-'}
          sub={`${thisPlan?.converted_count ?? 0} / ${thisPlan?.total_count ?? 0} 件`}
          color={
            planConversionRate == null ? 'gray' :
            planConversionRate >= 80   ? 'green' :
            planConversionRate >= 50   ? 'yellow' : 'red'
          }
        />
      </div>

      {/* ── 過去12ヶ月推移グラフ ─────────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          過去12ヶ月 売上・予定・予定案件・利益推移
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Legend />
            <Bar dataKey="売上"     fill="#3b82f6" />
            <Bar dataKey="予定"     fill="#d1d5db" />
            <Line dataKey="予定案件" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 3" dot={false} />
            <Line dataKey="利益"    stroke="#10b981" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs text-gray-400 mt-1">
          予定案件 = sale_plans（pending + 転換済みの合計）　予定 = forecasts（月次予算）
        </p>
      </div>

      {/* ── 当月カテゴリ別 実績 vs 予定(forecast) ────────────────── */}
      {avf && (
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            {formatYearMonth(thisMonth)} カテゴリ別 実績 vs 予定(forecast)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-xs">
                  <th className="text-left p-2">カテゴリ</th>
                  <th className="text-right p-2">実績</th>
                  <th className="text-right p-2">予定</th>
                  <th className="text-right p-2">達成率</th>
                  <th className="text-right p-2">実績利益</th>
                  <th className="text-right p-2">利益率</th>
                </tr>
              </thead>
              <tbody>
                {avf.data.map((row) => (
                  <tr key={row.category_id} className="border-t hover:bg-gray-50">
                    <td className="p-2 font-medium">{row.category_name}</td>
                    <td className="p-2 text-right">{formatCurrency(row.actual_amount)}</td>
                    <td className="p-2 text-right text-gray-500">{formatCurrency(row.forecast_amount)}</td>
                    <td className={`p-2 text-right font-semibold ${
                      (row.achievement_rate ?? 0) >= 100 ? 'text-green-600' :
                      (row.achievement_rate ?? 0) >= 80  ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {formatPercent(row.achievement_rate)}
                    </td>
                    <td className="p-2 text-right">{formatCurrency(row.actual_profit)}</td>
                    <td className="p-2 text-right">
                      {row.actual_amount > 0
                        ? formatPercent((row.actual_profit / row.actual_amount) * 100)
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 当月カテゴリ別 売上予定案件 ─────────────────────────── */}
      {planByCategory && planByCategory.some((r) => r.total_count > 0) && (
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            {formatYearMonth(thisMonth)} カテゴリ別 売上予定案件
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-xs">
                  <th className="text-left p-2">カテゴリ</th>
                  <th className="text-right p-2">予定中</th>
                  <th className="text-right p-2">予定金額</th>
                  <th className="text-right p-2">予定利益</th>
                  <th className="text-right p-2">転換済み</th>
                  <th className="text-right p-2">転換済金額</th>
                  <th className="text-right p-2">転換率</th>
                </tr>
              </thead>
              <tbody>
                {planByCategory.map((row) => {
                  const convRate = row.total_count > 0
                    ? (row.converted_count / row.total_count) * 100 : null;
                  return (
                    <tr key={row.category_id} className="border-t hover:bg-gray-50">
                      <td className="p-2 font-medium">{row.category_name}</td>
                      <td className="p-2 text-right">
                        {row.pending_count > 0
                          ? <span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded text-xs">{row.pending_count} 件</span>
                          : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="p-2 text-right font-medium">
                        {row.pending_amount > 0 ? formatCurrency(row.pending_amount) : '-'}
                      </td>
                      <td className="p-2 text-right text-green-600">
                        {row.pending_profit > 0 ? formatCurrency(row.pending_profit) : '-'}
                      </td>
                      <td className="p-2 text-right">
                        {row.converted_count > 0
                          ? <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-xs">{row.converted_count} 件</span>
                          : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="p-2 text-right text-gray-600">
                        {row.converted_amount > 0 ? formatCurrency(row.converted_amount) : '-'}
                      </td>
                      <td className={`p-2 text-right font-semibold ${
                        convRate == null   ? 'text-gray-400' :
                        convRate >= 80     ? 'text-green-600' :
                        convRate >= 50     ? 'text-yellow-600' : 'text-red-500'
                      }`}>
                        {convRate != null ? `${convRate.toFixed(0)}%` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
