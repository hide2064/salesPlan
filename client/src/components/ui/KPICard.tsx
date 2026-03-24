/**
 * @file KPICard.tsx
 * @description KPI（重要業績指標）表示カードコンポーネント
 *
 * ダッシュボードの売上・利益・達成率などの主要指標を
 * 色付きの左ボーダーカードとして表示する。
 */

/** KPICardのプロパティ型 */
interface Props {
  /** カードのタイトル（小文字、グレー） */
  title: string;
  /** メインの値（大きなフォントで表示） */
  value: string;
  /** サブテキスト（値の下に小さく表示。省略可） */
  sub?: string;
  /** 左ボーダーと背景の色テーマ（デフォルト: 'gray'） */
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'gray';
}

/**
 * 色テーマに対応するTailwindクラスマップ。
 * 達成率など値に応じて動的に色を切り替えるために使用。
 */
const colors = {
  blue:   'border-blue-500 bg-blue-50',
  green:  'border-green-500 bg-green-50',
  red:    'border-red-500 bg-red-50',
  yellow: 'border-yellow-500 bg-yellow-50',
  gray:   'border-gray-300 bg-white',
};

/**
 * KPI表示カード。
 * 左ボーダーの色でパフォーマンス（良好/警告/不良）を直感的に伝える。
 *
 * @example
 * // 達成率に応じて色を切り替える例
 * <KPICard
 *   title="達成率"
 *   value="85.0%"
 *   color={rate >= 100 ? 'green' : rate >= 80 ? 'yellow' : 'red'}
 * />
 */
export default function KPICard({ title, value, sub, color = 'gray' }: Props) {
  return (
    <div className={`rounded-lg border-l-4 p-4 shadow-sm ${colors[color]}`}>
      <p className="text-xs text-gray-500 font-medium mb-1">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}
