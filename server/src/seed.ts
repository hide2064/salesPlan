/**
 * サンプルデータ投入スクリプト
 * 実行: npx tsx src/seed.ts
 */
import pool, { initSchema } from './db';

// ────────────────────────────────────────────
// マスタデータ
// ────────────────────────────────────────────
const CATEGORIES = [
  { name: 'ソフトウェア', sort_order: 1 },
  { name: 'ハードウェア', sort_order: 2 },
  { name: 'サポート・保守', sort_order: 3 },
  { name: 'コンサルティング', sort_order: 4 },
];

const PRODUCTS = [
  // ソフトウェア (category_id = 1)
  { category: 'ソフトウェア', name: '業務管理システム Basic', code: 'SW-001', unit: 'ライセンス', default_unit_price: 150000, default_cost_price: 30000 },
  { category: 'ソフトウェア', name: '業務管理システム Pro', code: 'SW-002', unit: 'ライセンス', default_unit_price: 380000, default_cost_price: 76000 },
  { category: 'ソフトウェア', name: 'データ分析ツール', code: 'SW-003', unit: 'ライセンス', default_unit_price: 250000, default_cost_price: 50000 },
  // ハードウェア (category_id = 2)
  { category: 'ハードウェア', name: 'サーバ機器 A', code: 'HW-001', unit: '台', default_unit_price: 850000, default_cost_price: 600000 },
  { category: 'ハードウェア', name: 'ネットワーク機器', code: 'HW-002', unit: '台', default_unit_price: 320000, default_cost_price: 220000 },
  // サポート (category_id = 3)
  { category: 'サポート・保守', name: '年間保守契約', code: 'SP-001', unit: '契約', default_unit_price: 120000, default_cost_price: 40000 },
  { category: 'サポート・保守', name: '障害対応（スポット）', code: 'SP-002', unit: '時間', default_unit_price: 15000, default_cost_price: 8000 },
  // コンサル (category_id = 4)
  { category: 'コンサルティング', name: 'システム要件定義支援', code: 'CS-001', unit: '人日', default_unit_price: 80000, default_cost_price: 35000 },
  { category: 'コンサルティング', name: 'プロジェクト管理支援', code: 'CS-002', unit: '人日', default_unit_price: 90000, default_cost_price: 40000 },
];

const CUSTOMERS = [
  '株式会社アルファ商事', 'ベータ工業株式会社', 'ガンマシステムズ', 'デルタ製造株式会社',
  'イプシロン物流', 'ゼータ不動産', 'エータ食品株式会社', 'テータ建設',
  '株式会社イオタ', 'カッパデジタル', '株式会社ラムダ', 'ミュー電気株式会社',
];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomFloat(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

// ────────────────────────────────────────────
async function main() {
  await initSchema();

  const conn = await pool.getConnection();
  try {
    // カテゴリ
    const categoryIdMap: Record<string, number> = {};
    for (const cat of CATEGORIES) {
      const [existing]: any = await conn.query('SELECT id FROM categories WHERE name = ?', [cat.name]);
      if (existing.length > 0) {
        categoryIdMap[cat.name] = existing[0].id;
        continue;
      }
      const [res]: any = await conn.query(
        'INSERT INTO categories (name, sort_order) VALUES (?, ?)',
        [cat.name, cat.sort_order]
      );
      categoryIdMap[cat.name] = res.insertId;
    }
    console.log('Categories OK:', categoryIdMap);

    // 製品
    const productList: Array<{ id: number; category_id: number; unit_price: number; cost_price: number }> = [];
    for (const p of PRODUCTS) {
      const catId = categoryIdMap[p.category];
      const [existing]: any = await conn.query('SELECT id FROM products WHERE code = ?', [p.code]);
      let prodId: number;
      if (existing.length > 0) {
        prodId = existing[0].id;
      } else {
        const [res]: any = await conn.query(
          `INSERT INTO products (category_id, name, code, unit, default_unit_price, default_cost_price)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [catId, p.name, p.code, p.unit, p.default_unit_price, p.default_cost_price]
        );
        prodId = res.insertId;
      }
      productList.push({ id: prodId, category_id: catId, unit_price: p.default_unit_price, cost_price: p.default_cost_price });
    }
    console.log('Products OK');

    // 予定売上（過去12ヶ月）
    const today = new Date();
    for (let i = -11; i <= 0; i++) {
      const d = addMonths(today, i);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      for (const [catName, catId] of Object.entries(categoryIdMap)) {
        const baseAmount = catName === 'ハードウェア' ? 2000000 :
                           catName === 'ソフトウェア' ? 1500000 :
                           catName === 'コンサルティング' ? 800000 : 500000;
        const forecastAmount = Math.round(baseAmount * randomFloat(0.8, 1.2));
        const costRate = catName === 'ハードウェア' ? 0.72 :
                         catName === 'ソフトウェア' ? 0.22 :
                         catName === 'コンサルティング' ? 0.45 : 0.38;
        await conn.query(
          `INSERT INTO forecasts (\`year_month\`, \`year\`, \`month\`, category_id, forecast_amount, forecast_cost_rate)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE forecast_amount = VALUES(forecast_amount)`,
          [ym, d.getFullYear(), d.getMonth() + 1, catId, forecastAmount, costRate]
        );
      }
    }
    console.log('Forecasts OK');

    // 売上実績（過去12ヶ月 × 約200レコード）
    const salesInserted: number[] = [];
    const totalMonths = 12;
    const targetRecords = 210;
    const perMonth = Math.ceil(targetRecords / totalMonths);

    for (let i = -11; i <= 0; i++) {
      const baseDate = addMonths(today, i);
      const year = baseDate.getFullYear();
      const month = baseDate.getMonth() + 1;
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      const daysInMonth = new Date(year, month, 0).getDate();

      for (let j = 0; j < perMonth; j++) {
        const day = Math.floor(Math.random() * daysInMonth) + 1;
        const saleDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const prod = randomChoice(productList);
        const customer = randomChoice(CUSTOMERS);

        // 価格は標準 ±15% でランダム（顧客別・案件別の価格差を表現）
        const unitPrice = Math.round(prod.unit_price * randomFloat(0.85, 1.15));
        const costPrice = Math.round(prod.cost_price * randomFloat(0.9, 1.1));
        const quantity = randomFloat(1, 5);
        const amount = Math.round(quantity * unitPrice);
        const costAmount = Math.round(quantity * costPrice);

        const [res]: any = await conn.query(
          `INSERT INTO sales
           (sale_date, \`year\`, \`month\`, \`year_month\`, category_id, product_id, quantity,
            unit_price, cost_price, amount, cost_amount, customer_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [saleDate, year, month, ym, prod.category_id, prod.id, quantity,
           unitPrice, costPrice, amount, costAmount, customer]
        );
        salesInserted.push(res.insertId);
      }
    }

    console.log(`Sales inserted: ${salesInserted.length} records`);
    console.log('Seed completed!');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
