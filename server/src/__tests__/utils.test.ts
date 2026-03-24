/**
 * ユーティリティ関数のユニットテスト
 */

// year_month 生成ロジック
function toYearMonth(date: string): string {
  return date.substring(0, 7);
}

// 利益率計算
function calcProfitRate(amount: number, costAmount: number): number | null {
  if (amount <= 0) return null;
  return Math.round(((amount - costAmount) / amount) * 10000) / 100;
}

// 達成率計算
function calcAchievementRate(actual: number, forecast: number): number | null {
  if (forecast <= 0) return null;
  return Math.round((actual / forecast) * 10000) / 100;
}

describe('toYearMonth', () => {
  it('日付文字列から年月を抽出する', () => {
    expect(toYearMonth('2026-03-15')).toBe('2026-03');
    expect(toYearMonth('2025-12-31')).toBe('2025-12');
    expect(toYearMonth('2026-01-01')).toBe('2026-01');
  });
});

describe('calcProfitRate', () => {
  it('正常な利益率を計算する', () => {
    expect(calcProfitRate(100000, 30000)).toBe(70);
    expect(calcProfitRate(150000, 30000)).toBe(80);
    expect(calcProfitRate(100000, 100000)).toBe(0);
  });

  it('売上が0の場合はnullを返す', () => {
    expect(calcProfitRate(0, 0)).toBeNull();
    expect(calcProfitRate(0, 1000)).toBeNull();
  });

  it('小数点の丸めが正しい', () => {
    expect(calcProfitRate(300000, 100000)).toBe(66.67);
  });
});

describe('calcAchievementRate', () => {
  it('達成率を計算する', () => {
    expect(calcAchievementRate(100000, 100000)).toBe(100);
    expect(calcAchievementRate(80000, 100000)).toBe(80);
    expect(calcAchievementRate(120000, 100000)).toBe(120);
  });

  it('予定が0の場合はnullを返す', () => {
    expect(calcAchievementRate(50000, 0)).toBeNull();
  });

  it('小数点の丸めが正しい', () => {
    expect(calcAchievementRate(1, 3)).toBe(33.33);
  });
});
