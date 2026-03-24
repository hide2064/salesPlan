import api from './client';

export interface ImportRow {
  sale_date: string;
  category_name: string;
  product_name?: string;
  quantity: string;
  unit_price: string;
  cost_price?: string;
  amount: string;
  cost_amount?: string;
  customer_name?: string;
  description?: string;
}

export interface ImportResult {
  inserted: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export const importSales = (rows: ImportRow[]) =>
  api.post<ImportResult>('/import/sales', { rows }).then((r) => r.data);

export const exportSales = (params?: {
  year_month?: string;
  from?: string;
  to?: string;
  category_id?: number;
}) => api.get<any[]>('/export/sales', { params }).then((r) => r.data);

/** CSV文字列を ImportRow[] にパース（ヘッダ行必須） */
export const parseCsv = (text: string): ImportRow[] => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(',').map((v) => v.replace(/^"|"$/g, '').trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj as unknown as ImportRow;
  });
};

export const CSV_TEMPLATE_HEADER =
  'sale_date,category_name,product_name,quantity,unit_price,cost_price,amount,cost_amount,customer_name,description';

export const CSV_TEMPLATE_EXAMPLE =
  `${CSV_TEMPLATE_HEADER}\n2026-03-15,ソフトウェア,業務管理システム Basic,1,150000,30000,150000,30000,株式会社サンプル,初回導入`;
