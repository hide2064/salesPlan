import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { fetchMonthlySummary } from '../api/reports';
import { fetchActualVsForecast } from '../api/reports';
import KPICard from '../components/ui/KPICard';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import {
  formatCurrency, formatPercent, formatYearMonth,
  currentYearMonth, prevYearMonth, last12Months,
} from '../utils/formatters';

export default function Dashboard() {
  const months = last12Months();
  const thisMonth = currentYearMonth();
  const lastMonth = prevYearMonth(thisMonth);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['monthly-summary', months[0], months[11]],
    queryFn: () => fetchMonthlySummary({ from: months[0], to: months[11] }),
  });

  const { data: avf } = useQuery({
    queryKey: ['actual-vs-forecast', thisMonth],
    queryFn: () => fetchActualVsForecast(thisMonth),
  });

  if (summaryLoading) return <LoadingSpinner />;

  const thisMonthData = summary?.find((s) => s.year_month === thisMonth);
  const lastMonthData = summary?.find((s) => s.year_month === lastMonth);

  const momRate =
    lastMonthData && lastMonthData.total_amount > 0
      ? ((( thisMonthData?.total_amount ?? 0) - lastMonthData.total_amount) / lastMonthData.total_amount) * 100
      : null;

  const chartData = months.map((ym) => {
    const s = summary?.find((x) => x.year_month === ym);
    return {
      month: formatYearMonth(ym),
      売上: s?.total_amount ?? 0,
      予定: s?.total_forecast ?? 0,
      利益: s?.total_profit ?? 0,
    };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">ダッシュボード</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title={`当月売上 (${formatYearMonth(thisMonth)})`}
          value={formatCurrency(thisMonthData?.total_amount ?? 0)}
          color="blue"
        />
        <KPICard
          title="当月予定"
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
      </div>

      {/* 12ヶ月推移グラフ */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">過去12ヶ月 売上・予定・利益推移</h2>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Legend />
            <Bar dataKey="売上" fill="#3b82f6" />
            <Bar dataKey="予定" fill="#d1d5db" />
            <Line dataKey="利益" stroke="#10b981" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 当月 実績 vs 予定 */}
      {avf && (
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            {formatYearMonth(thisMonth)} カテゴリ別 実績 vs 予定
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600">
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
    </div>
  );
}
