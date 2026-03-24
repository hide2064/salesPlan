/**
 * db.ts
 * ─────────────────────────────────────────────────────────────
 * MySQL 接続プールの作成と DB スキーマ初期化を担当するモジュール。
 *
 * 接続設定は環境変数から読み取る (.env / docker-compose の environment):
 *   DB_HOST     : MySQLホスト (デフォルト: localhost)
 *   DB_PORT     : ポート番号  (デフォルト: 3306)
 *   DB_USER     : ユーザー名  (デフォルト: salesuser)
 *   DB_PASSWORD : パスワード  (デフォルト: salespass)
 *   DB_NAME     : DB名        (デフォルト: sales_plan)
 *
 * 使い方:
 *   import pool from './db';
 *   const [rows] = await pool.execute('SELECT * FROM categories');
 * ─────────────────────────────────────────────────────────────
 */
import mysql from 'mysql2/promise';

/**
 * コネクションプール
 * ─────────────────────────────────────────────────────────────
 * mysql2/promise の createPool は接続を都度生成・破棄するのでなく
 * 一定数の接続を保持して再利用する (パフォーマンス向上)。
 *
 * connectionLimit: 10
 *   → 同時に最大10接続をプールに保持。
 *     高負荷時はキューに溜まり waitForConnections で順番待ち。
 * timezone: '+09:00'
 *   → JST タイムゾーン。DATE/DATETIME 型の自動変換に影響する。
 * charset: 'utf8mb4'
 *   → 絵文字を含む日本語全般に対応した文字コード。
 */
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '3306'),
  user:     process.env.DB_USER     || 'salesuser',
  password: process.env.DB_PASSWORD || 'salespass',
  database: process.env.DB_NAME     || 'sales_plan',
  waitForConnections: true,  // 接続数上限時にエラーでなくキュー待ち
  connectionLimit: 10,        // プール内最大同時接続数
  queueLimit: 0,              // 0 = キュー上限なし
  timezone: '+09:00',         // JST タイムゾーン
  charset: 'utf8mb4',         // 絵文字・全角文字対応
});

/**
 * initSchema
 * ─────────────────────────────────────────────────────────────
 * アプリ起動時に一度だけ呼び出す DB 初期化関数。
 * CREATE TABLE IF NOT EXISTS を使用しているため、
 * テーブルが存在する場合は何もしない（冪等）。
 *
 * テーブル作成順序 (外部キー制約の依存関係順):
 *   1. categories          (参照される側)
 *   2. products            (categories を参照)
 *   3. product_price_history (products を参照)
 *   4. sales               (categories, products を参照)
 *   5. forecasts           (categories を参照)
 *   6. users               (独立)
 *   ※ 初期 admin ユーザーが存在しない場合のみ INSERT
 */
export async function initSchema(): Promise<void> {
  // プールから接続を1本取得してトランザクション外でDDLを実行
  // DDL (CREATE TABLE) は暗黙的にコミットされるためトランザクション不要
  const conn = await pool.getConnection();
  try {

    // ── テーブル1: categories (カテゴリマスタ) ──────────────────
    // 売上・予定売上の分類に使用。ソフトウェア/ハードウェア等。
    // is_active=0 で論理削除 (物理削除しない)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name       VARCHAR(100) NOT NULL,           -- カテゴリ名 (一意)
        sort_order INT          NOT NULL DEFAULT 0, -- 画面表示順
        is_active  TINYINT(1)   NOT NULL DEFAULT 1, -- 1=有効, 0=無効(論理削除)
        created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_categories_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── テーブル2: products (製品マスタ) ────────────────────────
    // カテゴリに紐づく製品を管理。
    // default_unit_price / default_cost_price は売上入力フォームの初期値として使用。
    // 実際の取引価格は sales テーブルに記録 (顧客別・時期別の価格差異を吸収)。
    await conn.query(`
      CREATE TABLE IF NOT EXISTS products (
        id                 INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
        category_id        INT           NOT NULL,
        name               VARCHAR(200)  NOT NULL,
        code               VARCHAR(50)   NULL,              -- 製品コード (任意・一意)
        unit               VARCHAR(20)   DEFAULT '個',      -- 数量単位 (個/本/式/etc.)
        default_cost_price DECIMAL(15,2) NULL,              -- 標準原価 (入力フォーム初期値)
        default_unit_price DECIMAL(15,2) NULL,              -- 標準販売単価 (入力フォーム初期値)
        is_active          TINYINT(1)    NOT NULL DEFAULT 1,
        created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_products_code (code),
        INDEX idx_products_category (category_id),  -- カテゴリ別絞り込みを高速化
        CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── テーブル3: product_price_history (製品価格改定履歴) ──────
    // 標準価格の改定履歴を追跡する。
    // valid_from: 適用開始日。最新の valid_from <= 対象日 が現在の標準価格。
    // ※ 取引ごとの実際価格は sales テーブルに記録するため別管理。
    await conn.query(`
      CREATE TABLE IF NOT EXISTS product_price_history (
        id         INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
        product_id INT           NOT NULL,
        valid_from DATE          NOT NULL,    -- この日以降の取引に適用される標準価格
        cost_price DECIMAL(15,2) NULL,        -- 改定後の標準原価
        unit_price DECIMAL(15,2) NULL,        -- 改定後の標準販売単価
        reason     VARCHAR(500)  NULL,        -- 改定理由 (仕入れ値変動・値上げ等)
        created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        -- 複合インデックス: 製品IDと適用日での検索を最適化
        INDEX idx_price_history_lookup (product_id, valid_from),
        CONSTRAINT fk_price_history_product FOREIGN KEY (product_id) REFERENCES products(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── テーブル4: sales (売上実績) ─────────────────────────────
    // 各取引ごとの売上実績を記録。最重要テーブル。
    //
    // 【重要な設計ポイント】
    //   ・unit_price / cost_price は「その取引での実際の価格」を記録
    //     → 同一製品でも顧客・案件・仕入れ先・時期によって価格が異なる
    //   ・year / month / year_month は sale_date から冗長に保持
    //     → GROUP BY year_month が year/month カラムで高速動作
    //     → BIツール連携でも year/month 別集計が容易
    //   ・profit_amount / profit_rate は保存しない
    //     → amount - cost_amount でクエリ時に計算 (データ不整合を防ぐ)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id            INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
        sale_date     DATE           NOT NULL,         -- 売上日 (YYYY-MM-DD)
        year          SMALLINT       NOT NULL,         -- 分析用: YEAR(sale_date) の冗長コピー
        month         TINYINT        NOT NULL,         -- 分析用: MONTH(sale_date) の冗長コピー
        year_month    CHAR(7)        NOT NULL,         -- 集計用: "YYYY-MM" 形式
        category_id   INT            NOT NULL,         -- カテゴリ (必須)
        product_id    INT            NULL,             -- 製品 (任意: 製品なし売上も可)
        quantity      DECIMAL(15,4)  NOT NULL DEFAULT 1, -- 数量 (小数対応: 0.5本等)
        unit_price    DECIMAL(15,2)  NOT NULL,         -- 実際の販売単価 (取引単位)
        cost_price    DECIMAL(15,2)  NULL,             -- 実際の原価単価 (取引単位)
        amount        DECIMAL(15,2)  NOT NULL,         -- 売上金額 (割引後調整も可)
        cost_amount   DECIMAL(15,2)  NULL,             -- 原価合計
        customer_name VARCHAR(200)   NULL,             -- 顧客・取引先名
        description   TEXT           NULL,             -- 備考・案件名等
        created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        -- 月次集計クエリ最適化インデックス
        INDEX idx_sales_year_month  (year_month),       -- GROUP BY year_month
        INDEX idx_sales_year_month2 (year, month),      -- GROUP BY year, month
        INDEX idx_sales_category    (category_id),      -- カテゴリ別絞り込み
        INDEX idx_sales_product     (product_id),       -- 製品別絞り込み
        INDEX idx_sales_customer    (customer_name),    -- 顧客別分析
        INDEX idx_sales_date        (sale_date),        -- 日付範囲検索
        CONSTRAINT fk_sales_category FOREIGN KEY (category_id) REFERENCES categories(id),
        CONSTRAINT fk_sales_product  FOREIGN KEY (product_id)  REFERENCES products(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── テーブル5: forecasts (予定売上) ─────────────────────────
    // 月×カテゴリ単位の売上予定を管理。
    // UNIQUE KEY (year_month, category_id) により同月同カテゴリは1件のみ。
    // → INSERT ... ON DUPLICATE KEY UPDATE で upsert 可能。
    // forecast_cost_rate: 予定原価率 (0.0〜1.0) → 予定利益 = 予定売上 × (1 - 予定原価率)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS forecasts (
        id                 INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
        year_month         CHAR(7)       NOT NULL,       -- 対象年月 "YYYY-MM"
        year               SMALLINT      NOT NULL,       -- 分析用冗長カラム
        month              TINYINT       NOT NULL,       -- 分析用冗長カラム
        category_id        INT           NOT NULL,
        forecast_amount    DECIMAL(15,2) NOT NULL,       -- 予定売上金額
        forecast_cost_rate DECIMAL(5,4)  NULL,           -- 予定原価率 (0.0000〜1.0000)
        notes              TEXT          NULL,           -- 備考
        created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        -- upsert を可能にするユニーク制約
        UNIQUE KEY uk_forecasts_month_category (year_month, category_id),
        INDEX idx_forecasts_year_month (year_month),
        CONSTRAINT fk_forecasts_category FOREIGN KEY (category_id) REFERENCES categories(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── テーブル6: users (ユーザー認証・権限管理) ────────────────
    // JWT 認証で使用するユーザー情報を管理。
    // password_hash: bcrypt でハッシュ化したパスワード (平文は保存しない)
    // role: admin > manager > viewer の3段階権限
    // is_active=0 でアカウント無効化 (物理削除しない)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        username      VARCHAR(50)  NOT NULL,               -- ログインID (一意)
        password_hash VARCHAR(100) NOT NULL,               -- bcrypt ハッシュ
        role          ENUM('admin','manager','viewer') NOT NULL DEFAULT 'viewer',
        display_name  VARCHAR(100) NOT NULL,               -- 画面表示名
        is_active     TINYINT(1)   NOT NULL DEFAULT 1,     -- 1=有効, 0=無効
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_users_username (username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ── 初期 admin ユーザーの自動作成 ────────────────────────────
    // admin ユーザーが存在しない場合のみ INSERT する。
    // パスワード: Admin1234! → bcrypt ハッシュ化 (コスト係数 10)
    // ※ 本番運用開始前に必ずパスワードを変更すること
    const bcrypt = await import('bcryptjs');
    const [existing]: any = await conn.query("SELECT id FROM users WHERE username = 'admin'");
    if (existing.length === 0) {
      const hash = await bcrypt.hash('Admin1234!', 10);
      await conn.query(
        "INSERT INTO users (username, password_hash, role, display_name) VALUES ('admin', ?, 'admin', '管理者')",
        [hash]
      );
      console.log('Initial admin user created: admin / Admin1234!');
    }

    console.log('Schema initialized');
  } finally {
    // 接続をプールに返却 (release しないとプールが枯渇する)
    conn.release();
  }
}

export default pool;
