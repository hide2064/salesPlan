/**
 * @file Dashboard.tsx
 * @description ダッシュボードページ
 *
 * ## 表示内容
 * 1. KPIカード (6枚)
 *    - 当月売上・当月予定・達成率・当月利益/利益率・前月比・当月件数
 * 2. 過去12ヶ月推移グラフ（ComposedChart: 売上・予定を棒グラフ、利益を折れ線）
 * 3. 当月カテゴリ別 実績 vs 予定 テーブル
 *
 * ## データ取得戦略
 * - monthly-summary: 過去12ヶ月分を一括取得し KPI・グラフ両方に使用
 * - actual-vs-forecast: 当月のカテゴリ別実績 vs 予定（下部テーブル用）
 * - staleTime 30秒のキャッシュで両クエリが同じデータを共有できる場合は再利用
 *
 * ## 前月比の計算
 * momRate = (当月売上 - 前月売上) / 前月売上 * 100
 * 前月売上がゼロの場合は null（'-' 表示）
 */

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

/**
 * ダッシュボードページ。
 * 経営者・管理者が当月の売上状況を一目で把握するためのサマリ画面。
 */
export default function Dashboard() {
  // 過去12ヶ月の年月配列（昇順: [11ヶ月前, ..., 当月]）
  const months = last12Months();
  const thisMonth = currentYearMonth();
  const lastMonth = prevYearMonth(thisMonth);

  // 月次サマリを過去12ヶ月分取得（KPIカード・グラフ共通）
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['monthly-summary', months[0], months[11]],
    queryFn: () => fetchMonthlySummary({ from: months[0], to: months[11] }),
  });

  // 当月のカテゴリ別 実績 vs 予定（下部テーブル用）
  const { data: avf } = useQuery({
    queryKey: ['actual-vs-forecast', thisMonth],
    queryFn: () => fetchActualVsForecast(thisMonth),
  });

  if (summaryLoading) return <LoadingSpinner />;

  // 当月・前月のサマリを summary[] から検索
  const thisMonthData = summary?.find((s) => s.year_month === thisMonth);
  const lastMonthData = summary?.find((s) => s.year_month === lastMonth);

  // 前月比率の計算（前月売上がゼロの場合は null）
  const momRate =
    lastMonthData && lastMonthData.total_amount > 0
      ? ((( thisMonthData?.total_amount ?? 0) - lastMonthData.total_amount) / lastMonthData.total_amount) * 100
      : null;

  // グラフ用データ: 12ヶ月分を month ラベルに変換（データがない月は 0 埋め）
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

      {/* KPIカード: 当月の主要指標を一覧表示 */}
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
        {/* 達成率: 100%以上=緑、80%以上=黄、80%未満=赤 */}
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
        {/* 前月比: プラス=緑、マイナス=赤、データなし=灰色 */}
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

      {/* 過去12ヶ月推移グラフ（売上・予定: 棒グラフ、利益: 折れ線グラフ） */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">過去12ヶ月 売上・予定・利益推移</h2>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            {/* Y軸: 万円単位でラベル表示 */}
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Legend />
            <Bar dataKey="売上" fill="#3b82f6" />
            <Bar dataKey="予定" fill="#d1d5db" />
            {/* 利益は折れ線で売上との比較を視覚化 */}
            <Line dataKey="利益" stroke="#10b981" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 当月カテゴリ別 実績 vs 予定テーブル */}
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
                    {/* 達成率: 色でパフォーマンスを表示 */}
                    <td className={`p-2 text-right font-semibold ${
                      (row.achievement_rate ?? 0) >= 100 ? 'text-green-600' :
                      (row.achievement_rate ?? 0) >= 80  ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {formatPercent(row.achievement_rate)}
                    </td>
                    <td className="p-2 text-right">{formatCurrency(row.actual_profit)}</td>
                    <td className="p-2 text-right">
                      {/* 利益率はDB値でなくクライアント側で計算（actual_profit / actual_amount） */}
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
