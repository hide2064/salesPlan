/**
 * テストデータCSV生成スクリプト
 * 実行: node generate_test_csv.mjs
 * 出力: test_import_data.csv
 *
 * 仕様:
 *   - 2025-04 〜 2026-03 の12ヶ月
 *   - 月100件 × 12ヶ月 = 1200件
 *   - 部署・課フィールドを含む
 */
import { writeFileSync } from 'fs';

// ── マスタデータ ────────────────────────────────────────────────

const PRODUCTS = [
  { category: 'ソフトウェア',     name: '業務管理システム Basic', up: 150000, cp: 30000,  qMin: 1, qMax: 3 },
  { category: 'ソフトウェア',     name: '業務管理システム Pro',   up: 380000, cp: 76000,  qMin: 1, qMax: 2 },
  { category: 'ソフトウェア',     name: 'データ分析ツール',       up: 250000, cp: 50000,  qMin: 1, qMax: 3 },
  { category: 'ソフトウェア',     name: 'セキュリティ管理ツール', up: 180000, cp: 36000,  qMin: 1, qMax: 5 },
  { category: 'ハードウェア',     name: 'サーバ機器 A',           up: 850000, cp: 600000, qMin: 1, qMax: 2 },
  { category: 'ハードウェア',     name: 'サーバ機器 B',           up: 1200000, cp: 850000, qMin: 1, qMax: 1 },
  { category: 'ハードウェア',     name: 'ネットワーク機器',       up: 320000, cp: 220000, qMin: 1, qMax: 3 },
  { category: 'ハードウェア',     name: 'ストレージ装置',         up: 450000, cp: 310000, qMin: 1, qMax: 2 },
  { category: 'サポート・保守',   name: '年間保守契約',           up: 120000, cp: 40000,  qMin: 1, qMax: 5 },
  { category: 'サポート・保守',   name: '障害対応（スポット）',   up: 15000,  cp: 8000,   qMin: 2, qMax: 16 },
  { category: 'サポート・保守',   name: 'リモート監視サービス',   up: 50000,  cp: 18000,  qMin: 1, qMax: 12 },
  { category: 'コンサルティング', name: 'システム要件定義支援',   up: 80000,  cp: 35000,  qMin: 3, qMax: 15 },
  { category: 'コンサルティング', name: 'プロジェクト管理支援',   up: 90000,  cp: 40000,  qMin: 5, qMax: 20 },
  { category: 'コンサルティング', name: 'DX戦略策定支援',        up: 120000, cp: 55000,  qMin: 2, qMax: 10 },
];

const CUSTOMERS = [
  '株式会社アルファ商事', 'ベータ工業株式会社', 'ガンマシステムズ', 'デルタ製造株式会社',
  'イプシロン物流', 'ゼータ不動産', 'エータ食品株式会社', 'テータ建設',
  '株式会社イオタ', 'カッパデジタル', '株式会社ラムダ', 'ミュー電気株式会社',
  'ニュー精工株式会社', '株式会社クシ技研', 'オミクロン化学', 'パイ情報システム',
  'ロー物産株式会社', 'シグマ自動車', '株式会社タウ設計', 'ウプシロン薬品',
];

// 部署 → 課 の階層定義
const DEPARTMENTS = [
  {
    dept: '第一営業部',
    sections: ['第一営業課', '第二営業課', '官公庁営業課'],
  },
  {
    dept: '第二営業部',
    sections: ['東日本営業課', '西日本営業課', '海外営業課'],
  },
  {
    dept: 'SI事業部',
    sections: ['システム開発課', 'インフラ課', 'PMO課'],
  },
  {
    dept: 'サービス事業部',
    sections: ['サポート課', '保守管理課'],
  },
  {
    dept: 'コンサルティング部',
    sections: ['戦略コンサル課', 'ITコンサル課'],
  },
];

const DESCRIPTIONS = {
  'ソフトウェア':     ['新規導入', '追加ライセンス', '拠点展開', '機能拡張', 'バージョンアップ', '工場管理向け', '本社導入'],
  'ハードウェア':     ['データセンター増設', '拠点間VPN', '生産管理サーバ', 'DR環境構築', 'バックアップ機器', '全拠点LAN整備'],
  'サポート・保守':   ['年度保守契約', '保守契約更新', '緊急障害対応', '月次定期点検', 'セキュリティ対応', '夜間サポート'],
  'コンサルティング': ['基幹系刷新PJ', 'DXロードマップ策定', 'クラウド移行支援', 'ERP導入PM', 'BIM検討支援', '業務分析', '要件定義支援'],
};

// ── ユーティリティ ──────────────────────────────────────────────

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[rand(0, arr.length - 1)];
}

/** ±pct のランダム変動、1000円単位に丸める */
function jitter(base, pct = 0.15) {
  const v = Math.round(base * (1 + (Math.random() * 2 - 1) * pct) / 1000) * 1000;
  return Math.max(v, 1000);
}

/** CSVセルの値をクォート（カンマ・改行を含む場合にダブルクォートで囲む） */
function q(val) {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── データ生成 ──────────────────────────────────────────────────

// 2025-04 〜 2026-03 の12ヶ月
const months = [];
for (let y = 2025, m = 4; !(y === 2026 && m === 4); m++) {
  if (m > 12) { m = 1; y++; }
  months.push({ y, m });
}

const PER_MONTH = 100;
const rows = [];

for (const { y, m } of months) {
  const mm = String(m).padStart(2, '0');
  const daysInMonth = new Date(y, m, 0).getDate();

  for (let i = 0; i < PER_MONTH; i++) {
    const prod = pick(PRODUCTS);
    const deptInfo = pick(DEPARTMENTS);
    const section = pick(deptInfo.sections);

    const day = String(rand(1, daysInMonth)).padStart(2, '0');
    const sale_date = `${y}-${mm}-${day}`;
    const qty = rand(prod.qMin, prod.qMax);
    const up = jitter(prod.up);
    const cp = jitter(prod.cp);
    const amount = qty * up;
    const cost_amount = qty * cp;

    rows.push([
      sale_date,
      prod.category,
      prod.name,
      qty,
      up,
      cp,
      amount,
      cost_amount,
      pick(CUSTOMERS),
      deptInfo.dept,
      section,
      pick(DESCRIPTIONS[prod.category]),
    ]);
  }
}

// 日付昇順にソート
rows.sort((a, b) => a[0].localeCompare(b[0]));

// ── CSV出力 ─────────────────────────────────────────────────────

const header = 'sale_date,category_name,product_name,quantity,unit_price,cost_price,amount,cost_amount,customer_name,department,section,description';
const csv = '\uFEFF' + header + '\n' + rows.map((r) => r.map(q).join(',')).join('\n');

writeFileSync('test_import_data.csv', csv, 'utf8');
console.log(`生成完了: ${rows.length} 件 → test_import_data.csv`);
console.log(`  期間: ${months[0].y}-${String(months[0].m).padStart(2,'0')} 〜 ${months[months.length-1].y}-${String(months[months.length-1].m).padStart(2,'0')}`);
console.log(`  月100件 × ${months.length}ヶ月 = ${rows.length}件`);
