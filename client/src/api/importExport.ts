/**
 * @file importExport.ts
 * @description CSV インポート / エクスポートAPIコール関数とCSVユーティリティ
 *
 * ## インポートフロー
 * 1. ユーザーがCSVファイルを選択
 * 2. parseCsv() でCSVテキスト → ImportRow[] に変換（クライアント側）
 * 3. importSales() でサーバーに送信（POST /api/import/sales）
 * 4. サーバーがバリデーション・DB登録を行い { inserted, skipped, errors } を返す
 *
 * ## エクスポートフロー
 * 1. exportSales() でサーバーからJSON配列を取得
 * 2. formatters.exportCsv() でJSON → CSVファイルをブラウザダウンロード
 *
 * ## CSV形式
 * - ヘッダ行必須（parseCsv のヘッダマッピングに使用）
 * - カンマ区切り、値はダブルクォートで囲んでも可
 * - 文字コード: UTF-8 with BOM（Excel互換）
 */

import api from './client';

/**
 * CSVインポート時の1行データ型。
 * 全フィールドを文字列で受け取り、サーバー側で数値変換・バリデーションを行う。
 */
export interface ImportRow {
  /** 売上日 (YYYY-MM-DD) — 必須 */
  sale_date: string;
  /** カテゴリ名（DBのカテゴリ名と完全一致） — 必須 */
  category_name: string;
  /** 製品名（DBの製品名と完全一致） — 任意 */
  product_name?: string;
  /** 数量（文字列、サーバーでparseFloat） — 必須 */
  quantity: string;
  /** 販売単価（文字列、サーバーでparseFloat） — 必須 */
  unit_price: string;
  /** 原価単価（文字列） — 任意 */
  cost_price?: string;
  /** 売上金額（文字列、サーバーでparseFloat） — 必須 */
  amount: string;
  /** 原価合計（文字列） — 任意 */
  cost_amount?: string;
  /** 顧客名 — 任意 */
  customer_name?: string;
  /** 備考 — 任意 */
  description?: string;
}

/**
 * インポート結果の型。
 * errors が空でも inserted > 0 なら部分成功として扱う。
 */
export interface ImportResult {
  /** 登録成功した件数 */
  inserted: number;
  /** スキップ（エラー）した件数 */
  skipped: number;
  /** 行別エラー詳細（最大50件） */
  errors: { row: number; message: string }[];
}

/**
 * CSVデータをサーバーに送信して売上を一括登録する。
 * サーバーは部分成功を許容する（エラー行をスキップして正常行のみINSERT）。
 *
 * @param rows - parseCsv() で変換した ImportRow[] (最大1000件)
 * @returns ImportResult — 登録件数・スキップ件数・エラー詳細
 */
export const importSales = (rows: ImportRow[]) =>
  api.post<ImportResult>('/import/sales', { rows }).then((r) => r.data);

/**
 * 売上データをJSON配列でエクスポートする。
 * profit_amount / profit_rate を含む（サーバー側でSQLにより計算）。
 *
 * @param params.year_month  - 特定年月 (YYYY-MM)
 * @param params.from        - 開始年月 (YYYY-MM)
 * @param params.to          - 終了年月 (YYYY-MM)
 * @param params.category_id - カテゴリIDで絞り込み
 * @returns エクスポートデータの配列（型はサーバーのSELECT結果に依存）
 */
export const exportSales = (params?: {
  year_month?: string;
  from?: string;
  to?: string;
  category_id?: number;
}) => api.get<any[]>('/export/sales', { params }).then((r) => r.data);

/**
 * CSVテキストを ImportRow[] にパースする。
 * 1行目をヘッダとして解釈し、2行目以降を列マッピングする。
 * ダブルクォートの除去・trim処理を行う（Excel出力のCSV対応）。
 *
 * @param text - CSVファイルのテキスト内容
 * @returns ImportRow[] — 空行は自動除去、ヘッダのみのファイルは空配列を返す
 */
export const parseCsv = (text: string): ImportRow[] => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return []; // ヘッダのみ or 空ファイル
  const headers = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(',').map((v) => v.replace(/^"|"$/g, '').trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj as unknown as ImportRow;
  });
};

/**
 * CSVテンプレートのヘッダ行文字列。
 * インポート用CSVのカラム順を定義する。
 */
export const CSV_TEMPLATE_HEADER =
  'sale_date,category_name,product_name,quantity,unit_price,cost_price,amount,cost_amount,customer_name,description';

/**
 * CSVテンプレートのサンプルデータ付き文字列。
 * ユーザーがダウンロードしてインポート用CSVの雛形として使用する。
 */
export const CSV_TEMPLATE_EXAMPLE =
  `${CSV_TEMPLATE_HEADER}\n2026-03-15,ソフトウェア,業務管理システム Basic,1,150000,30000,150000,30000,株式会社サンプル,初回導入`;
