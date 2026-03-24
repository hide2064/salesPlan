/**
 * CSVインポートのバリデーションロジックのユニットテスト
 */

interface ImportRow {
  sale_date?: string;
  category_name?: string;
  product_name?: string;
  quantity?: string;
  unit_price?: string;
  cost_price?: string;
  amount?: string;
  cost_amount?: string;
  customer_name?: string;
  description?: string;
}

interface ValidationError {
  row: number;
  message: string;
}

function parseNum(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function validateRow(row: ImportRow, rowNum: number, catMap: Record<string, number>): ValidationError | null {
  if (!row.sale_date || !row.sale_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { row: rowNum, message: 'sale_date が不正' };
  }
  if (!row.category_name) {
    return { row: rowNum, message: 'category_name が空' };
  }
  if (!catMap[row.category_name]) {
    return { row: rowNum, message: `カテゴリ "${row.category_name}" が見つかりません` };
  }
  const quantity = parseNum(row.quantity);
  if (quantity === null || quantity < 0) return { row: rowNum, message: 'quantity が不正' };
  const unitPrice = parseNum(row.unit_price);
  if (unitPrice === null || unitPrice < 0) return { row: rowNum, message: 'unit_price が不正' };
  const amount = parseNum(row.amount);
  if (amount === null || amount < 0) return { row: rowNum, message: 'amount が不正' };
  return null;
}

const CAT_MAP: Record<string, number> = {
  'ソフトウェア': 1, 'ハードウェア': 2, 'サポート・保守': 3, 'コンサルティング': 4,
};

describe('parseNum', () => {
  it('数値文字列を変換', () => {
    expect(parseNum('100')).toBe(100);
    expect(parseNum('1.5')).toBe(1.5);
    expect(parseNum('0')).toBe(0);
  });
  it('空文字・undefinedはnull', () => {
    expect(parseNum('')).toBeNull();
    expect(parseNum(undefined)).toBeNull();
  });
  it('非数値はnull', () => {
    expect(parseNum('abc')).toBeNull();
  });
});

describe('validateRow', () => {
  const validRow: ImportRow = {
    sale_date: '2026-03-15',
    category_name: 'ソフトウェア',
    quantity: '1',
    unit_price: '150000',
    amount: '150000',
  };

  it('正常なデータはエラーなし', () => {
    expect(validateRow(validRow, 2, CAT_MAP)).toBeNull();
  });

  it('日付が不正な場合エラー', () => {
    const err = validateRow({ ...validRow, sale_date: '2026/03/15' }, 2, CAT_MAP);
    expect(err?.message).toContain('sale_date');
  });

  it('カテゴリ名が空の場合エラー', () => {
    const err = validateRow({ ...validRow, category_name: '' }, 2, CAT_MAP);
    expect(err?.message).toContain('category_name');
  });

  it('存在しないカテゴリの場合エラー', () => {
    const err = validateRow({ ...validRow, category_name: '存在しない' }, 2, CAT_MAP);
    expect(err?.message).toContain('見つかりません');
  });

  it('数量が負の場合エラー', () => {
    const err = validateRow({ ...validRow, quantity: '-1' }, 2, CAT_MAP);
    expect(err?.message).toContain('quantity');
  });

  it('金額が不正な場合エラー', () => {
    const err = validateRow({ ...validRow, amount: 'abc' }, 2, CAT_MAP);
    expect(err?.message).toContain('amount');
  });

  it('行番号が正しく設定される', () => {
    const err = validateRow({ ...validRow, sale_date: 'bad' }, 5, CAT_MAP);
    expect(err?.row).toBe(5);
  });
});
