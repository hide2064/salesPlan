/**
 * @file formatters.ts
 * @description 表示用フォーマット関数・日付ユーティリティ
 *
 * ## 設計方針
 * - null / undefined を受け取ったら '-' を返す（コンポーネントが null チェック不要）
 * - Intl.NumberFormat を module スコープで1回だけ生成（各呼び出しで new しない）
 * - 全て純粋関数（副作用なし）
 *
 * ## 日付型の注意
 * - DB から返る日付は ISO 8601 文字列 (例: "2026-03-15T00:00:00.000Z")
 * - formatDate は先頭10文字だけ取り出すシンプル実装
 * - year_month は "YYYY-MM" 形式を前提とする
 */

/** 日本円フォーマッター（小数点以下なし、¥記号付き） */
const jpyFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

/** 日本語ロケールの数値フォーマッター（カンマ区切り） */
const numberFormatter = new Intl.NumberFormat('ja-JP');

/**
 * 数値を日本円表示にフォーマットする。
 * 例: 1500000 → "¥1,500,000"
 *
 * @param value - 金額（number | null | undefined）
 * @returns 通貨フォーマット済み文字列。null/undefinedは '-'
 */
export const formatCurrency = (value: number | null | undefined): string => {
  if (value == null) return '-';
  return jpyFormatter.format(value);
};

/**
 * 数値をカンマ区切りにフォーマットする。
 * 例: 12345 → "12,345"
 *
 * @param value - 数値（number | null | undefined）
 * @returns カンマ区切り文字列。null/undefinedは '-'
 */
export const formatNumber = (value: number | null | undefined): string => {
  if (value == null) return '-';
  return numberFormatter.format(value);
};

/**
 * 数値をパーセント表示にフォーマットする。
 * 例: 85.7 → "85.7%"
 *
 * @param value  - パーセント値（例: 85.7）。サーバーから既に %換算で来る値を想定
 * @param digits - 小数点以下桁数（デフォルト: 1）
 * @returns パーセント文字列。null/undefinedは '-'
 */
export const formatPercent = (value: number | null | undefined, digits = 1): string => {
  if (value == null) return '-';
  return `${value.toFixed(digits)}%`;
};

/**
 * ISO日付文字列から日付部分（YYYY-MM-DD）のみを取り出す。
 * 例: "2026-03-15T00:00:00.000Z" → "2026-03-15"
 *
 * @param dateStr - ISO日付文字列
 * @returns YYYY-MM-DD 形式の文字列。null/undefinedは '-'
 */
export const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '-';
  return dateStr.substring(0, 10);
};

/**
 * "YYYY-MM" 形式の年月を日本語表示に変換する。
 * 例: "2026-03" → "2026年3月"（月の先頭0は除去）
 *
 * @param ym - 年月文字列 (YYYY-MM)
 * @returns "YYYY年M月" 形式の文字列
 */
export const formatYearMonth = (ym: string): string => {
  if (!ym || ym.length < 7) return ym;
  return `${ym.substring(0, 4)}年${parseInt(ym.substring(5, 7))}月`;
};

/**
 * 現在の年月を "YYYY-MM" 形式で返す。
 * ページの初期値設定に使用する。
 *
 * @returns 現在の年月 (YYYY-MM)
 */
export const currentYearMonth = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

/**
 * 指定した年月の前月を "YYYY-MM" 形式で返す。
 * 1月 → 前年12月 のロールオーバーに対応。
 *
 * @param ym - 年月文字列 (YYYY-MM)
 * @returns 前月の年月 (YYYY-MM)
 */
export const prevYearMonth = (ym: string): string => {
  const year = parseInt(ym.substring(0, 4));
  const month = parseInt(ym.substring(5, 7));
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
};

/**
 * 現在月を含む過去12ヶ月分の年月配列を返す（昇順）。
 * ダッシュボードのグラフ期間指定に使用する。
 * 例: 現在 2026-03 → ["2025-04", "2025-05", ..., "2026-03"]
 *
 * @returns string[] — YYYY-MM 形式の年月、古い月から順
 */
export const last12Months = (): string[] => {
  const result: string[] = [];
  let ym = currentYearMonth();
  for (let i = 0; i < 12; i++) {
    result.unshift(ym); // 先頭に追加して昇順を維持
    ym = prevYearMonth(ym);
  }
  return result;
};

/**
 * データをCSVファイルとしてブラウザでダウンロードする。
 * BOM付きUTF-8で出力するためExcelで文字化けしない。
 *
 * @param headers  - ヘッダ行の列名配列
 * @param rows     - データ行の2次元配列（null は空文字に変換）
 * @param filename - ダウンロードファイル名 (.csv 付き推奨)
 *
 * @example
 * exportCsv(
 *   ['日付', '売上', '利益'],
 *   [['2026-03-15', 150000, 50000]],
 *   'sales_2026-03.csv'
 * );
 */
export const exportCsv = (headers: string[], rows: (string | number | null)[][], filename: string) => {
  const bom = '\uFEFF'; // BOM: Excel が UTF-8 と認識するために必要
  const csv = bom + [headers.join(','), ...rows.map((r) => r.map((v) => `"${v ?? ''}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  // オブジェクトURLを生成して <a> タグのダウンロードをトリガー
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url); // メモリリーク防止のためURLを即時解放
};
