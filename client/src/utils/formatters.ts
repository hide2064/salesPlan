const jpyFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('ja-JP');

export const formatCurrency = (value: number | null | undefined): string => {
  if (value == null) return '-';
  return jpyFormatter.format(value);
};

export const formatNumber = (value: number | null | undefined): string => {
  if (value == null) return '-';
  return numberFormatter.format(value);
};

export const formatPercent = (value: number | null | undefined, digits = 1): string => {
  if (value == null) return '-';
  return `${value.toFixed(digits)}%`;
};

export const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '-';
  return dateStr.substring(0, 10);
};

export const formatYearMonth = (ym: string): string => {
  if (!ym || ym.length < 7) return ym;
  return `${ym.substring(0, 4)}年${parseInt(ym.substring(5, 7))}月`;
};

export const currentYearMonth = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

export const prevYearMonth = (ym: string): string => {
  const year = parseInt(ym.substring(0, 4));
  const month = parseInt(ym.substring(5, 7));
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
};

export const last12Months = (): string[] => {
  const result: string[] = [];
  let ym = currentYearMonth();
  for (let i = 0; i < 12; i++) {
    result.unshift(ym);
    ym = prevYearMonth(ym);
  }
  return result;
};

export const exportCsv = (headers: string[], rows: (string | number | null)[][], filename: string) => {
  const bom = '\uFEFF';
  const csv = bom + [headers.join(','), ...rows.map((r) => r.map((v) => `"${v ?? ''}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
