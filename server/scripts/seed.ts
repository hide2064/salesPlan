/**
 * seed.ts
 * ─────────────────────────────────────────────────────────────
 * DBをリセットしてサンプルデータ（売上実績・売上予定案件）を投入するスクリプト。
 *
 * 実行方法:
 *   cd server
 *   npx tsx scripts/seed.ts
 *
 * ※ categories / products / users は保持し、sales / sale_plans のみリセットする。
 * ─────────────────────────────────────────────────────────────
 */

import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '3307'),
  user:     process.env.DB_USER     || 'salesuser',
  password: process.env.DB_PASSWORD || 'salespass',
  database: process.env.DB_NAME     || 'sales_plan',
  waitForConnections: true,
  connectionLimit: 5,
  timezone: '+09:00',
  charset:  'utf8mb4',
});

// ── ランダムユーティリティ ──────────────────────────────────────
const rand = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (min: number, max: number) =>
  Math.round((Math.random() * (max - min) + min) * 100) / 100;
const pick = <T>(arr: T[]): T => arr[rand(0, arr.length - 1)];

// ── マスターデータ定義 ─────────────────────────────────────────
const DEPARTMENTS = ['東京営業部', '大阪営業部', '名古屋営業部'];
const SECTIONS: Record<string, string[]> = {
  '東京営業部':   ['第一営業課', '第二営業課', '第三営業課'],
  '大阪営業部':   ['西日本第一課', '西日本第二課'],
  '名古屋営業部': ['中部営業課', 'エンタープライズ課'],
};
const CUSTOMERS = [
  '株式会社アルファテック', '合同会社ベータシステム', '株式会社ガンマソリューション',
  'デルタ情報サービス株式会社', 'イプシロン通信株式会社', '株式会社ゼータコーポレーション',
  'エータ産業株式会社', 'シータテクノロジー株式会社', '株式会社イオタネットワーク',
  'カッパIT株式会社', '株式会社ラムダシステムズ', 'ミュー電機株式会社',
  'ニュー情報センター株式会社', '株式会社クサイデジタル', 'オミクロン物流株式会社',
  '株式会社パイソフトウェア', 'ロー製造株式会社', 'シグマエンジニアリング株式会社',
  '株式会社タウデータ', 'ウプシロン建設株式会社', 'ファイ商事株式会社',
  'カイ医療システム株式会社', 'プサイ金融ソリューション株式会社', 'オメガ教育サービス株式会社',
];

// ── 年月ユーティリティ ──────────────────────────────────────────
function addMonths(base: Date, n: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + n);
  return d;
}
function toYM(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function randDateInMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const day = rand(1, lastDay);
  return `${ym}-${String(day).padStart(2, '0')}`;
}

async function main() {
  const conn = await pool.getConnection();
  try {
    // ── マスター取得 ─────────────────────────────────────────
    const [catRows]: any = await conn.query('SELECT id, name FROM categories WHERE is_active = 1 ORDER BY sort_order');
    const [prodRows]: any = await conn.query(
      'SELECT id, category_id, default_unit_price, default_cost_price FROM products WHERE is_active = 1'
    );

    if (catRows.length === 0 || prodRows.length === 0) {
      console.error('categories / products が空です。seed_master.sql を先に実行してください。');
      process.exit(1);
    }

    // category_id → products[] のマップ
    const prodByCategory: Record<number, any[]> = {};
    for (const p of prodRows) {
      if (!prodByCategory[p.category_id]) prodByCategory[p.category_id] = [];
      prodByCategory[p.category_id].push(p);
    }

    // ── 既存データ削除 ───────────────────────────────────────
    console.log('既存データ削除中...');
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query('TRUNCATE TABLE sale_plans');
    await conn.query('TRUNCATE TABLE sales');
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('削除完了。');

    // ── 対象期間: 13ヶ月前〜当月 ─────────────────────────────
    const now = new Date();
    const baseMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const months: string[] = [];
    for (let i = -12; i <= 0; i++) months.push(toYM(addMonths(baseMonth, i)));

    const thisMonth = toYM(now);

    // ── sales（売上実績）生成 ────────────────────────────────
    console.log('売上実績データ生成中...');
    let salesTotal = 0;

    for (const ym of months) {
      const count = rand(90, 110);
      for (let i = 0; i < count; i++) {
        const cat  = pick(catRows);
        const prods = prodByCategory[cat.id] ?? [];
        const useProduct = prods.length > 0 && Math.random() > 0.1; // 90%確率で製品あり
        const prod = useProduct ? pick(prods) : null;

        const baseUnitPrice = prod?.default_unit_price
          ? parseFloat(prod.default_unit_price) * randFloat(0.85, 1.15)
          : rand(10000, 500000);
        const baseCostPrice = prod?.default_cost_price
          ? parseFloat(prod.default_cost_price) * randFloat(0.9, 1.1)
          : baseUnitPrice * randFloat(0.3, 0.7);

        const qty        = randFloat(1, cat.name === 'ハードウェア' ? 5 : 10);
        const unitPrice  = Math.round(baseUnitPrice);
        const costPrice  = Math.round(baseCostPrice);
        const amount     = Math.round(qty * unitPrice);
        const costAmount = Math.round(qty * costPrice);

        const dept    = pick(DEPARTMENTS);
        const section = pick(SECTIONS[dept]);
        const saleDate = randDateInMonth(ym);
        const [y, m] = ym.split('-').map(Number);

        await conn.query(
          `INSERT INTO sales
             (sale_date, \`year\`, \`month\`, \`year_month\`,
              category_id, product_id, quantity, unit_price, cost_price,
              amount, cost_amount, customer_name, department, section, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [saleDate, y, m, ym,
           cat.id, prod?.id ?? null, qty, unitPrice, costPrice,
           amount, costAmount, pick(CUSTOMERS), dept, section,
           Math.random() > 0.7 ? `${cat.name}案件` : null]
        );
        salesTotal++;
      }
    }
    console.log(`売上実績: ${salesTotal} 件挿入完了`);

    // ── sale_plans（売上予定案件）生成 ────────────────────────
    console.log('売上予定案件データ生成中...');
    let planTotal = 0;

    for (const ym of months) {
      const count     = rand(85, 115);
      const isPast    = ym < thisMonth;
      const isCurrent = ym === thisMonth;

      for (let i = 0; i < count; i++) {
        const cat   = pick(catRows);
        const prods = prodByCategory[cat.id] ?? [];
        const useProduct = prods.length > 0 && Math.random() > 0.1;
        const prod  = useProduct ? pick(prods) : null;

        const baseUnitPrice = prod?.default_unit_price
          ? parseFloat(prod.default_unit_price) * randFloat(0.85, 1.15)
          : rand(10000, 500000);
        const baseCostPrice = prod?.default_cost_price
          ? parseFloat(prod.default_cost_price) * randFloat(0.9, 1.1)
          : baseUnitPrice * randFloat(0.3, 0.7);

        const qty        = randFloat(1, cat.name === 'ハードウェア' ? 5 : 10);
        const unitPrice  = Math.round(baseUnitPrice);
        const costPrice  = Math.round(baseCostPrice);
        const amount     = Math.round(qty * unitPrice);
        const costAmount = Math.round(qty * costPrice);

        const dept    = pick(DEPARTMENTS);
        const section = pick(SECTIONS[dept]);
        const planDate = randDateInMonth(ym);
        const [y, m]   = ym.split('-').map(Number);

        // ステータス分布:
        //   過去月: 90% converted, 10% pending（未処理扱い）
        //   当月:   50% converted, 50% pending（進行中）
        //   将来月: 100% pending（まだ転換前）
        let status: 'pending' | 'converted';
        if (isPast)         status = Math.random() < 0.9 ? 'converted' : 'pending';
        else if (isCurrent) status = Math.random() < 0.5 ? 'converted' : 'pending';
        else                status = 'pending';

        // converted の場合は sales に対応レコードを作成し sales_id を紐付ける
        let salesId: number | null = null;
        if (status === 'converted') {
          const [sr]: any = await conn.query(
            `INSERT INTO sales
               (sale_date, \`year\`, \`month\`, \`year_month\`,
                category_id, product_id, quantity, unit_price, cost_price,
                amount, cost_amount, customer_name, department, section, description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [planDate, y, m, ym,
             cat.id, prod?.id ?? null, qty, unitPrice, costPrice,
             amount, costAmount, pick(CUSTOMERS), dept, section, null]
          );
          salesId = sr.insertId;
          salesTotal++;
        }

        await conn.query(
          `INSERT INTO sale_plans
             (plan_date, \`year\`, \`month\`, \`year_month\`,
              category_id, product_id, quantity, unit_price, cost_price,
              amount, cost_amount, customer_name, department, section,
              description, status, sales_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [planDate, y, m, ym,
           cat.id, prod?.id ?? null, qty, unitPrice, costPrice,
           amount, costAmount, pick(CUSTOMERS), dept, section,
           `${cat.name}予定案件`, status, salesId]
        );
        planTotal++;
      }
    }
    console.log(`売上予定案件: ${planTotal} 件挿入完了`);
    console.log(`売上実績合計: ${salesTotal} 件（予定転換分含む）`);
    console.log('シード完了！');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
