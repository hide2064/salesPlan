import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'salesuser',
  password: process.env.DB_PASSWORD || 'salespass',
  database: process.env.DB_NAME || 'sales_plan',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+09:00',
  charset: 'utf8mb4',
});

export async function initSchema(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name       VARCHAR(100) NOT NULL,
        sort_order INT          NOT NULL DEFAULT 0,
        is_active  TINYINT(1)   NOT NULL DEFAULT 1,
        created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_categories_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS products (
        id                 INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
        category_id        INT           NOT NULL,
        name               VARCHAR(200)  NOT NULL,
        code               VARCHAR(50)   NULL,
        unit               VARCHAR(20)   DEFAULT '個',
        default_cost_price DECIMAL(15,2) NULL,
        default_unit_price DECIMAL(15,2) NULL,
        is_active          TINYINT(1)    NOT NULL DEFAULT 1,
        created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_products_code (code),
        INDEX idx_products_category (category_id),
        CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS product_price_history (
        id         INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
        product_id INT           NOT NULL,
        valid_from DATE          NOT NULL,
        cost_price DECIMAL(15,2) NULL,
        unit_price DECIMAL(15,2) NULL,
        reason     VARCHAR(500)  NULL,
        created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_price_history_lookup (product_id, valid_from),
        CONSTRAINT fk_price_history_product FOREIGN KEY (product_id) REFERENCES products(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id            INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
        sale_date     DATE           NOT NULL,
        year          SMALLINT       NOT NULL,
        month         TINYINT        NOT NULL,
        year_month    CHAR(7)        NOT NULL,
        category_id   INT            NOT NULL,
        product_id    INT            NULL,
        quantity      DECIMAL(15,4)  NOT NULL DEFAULT 1,
        unit_price    DECIMAL(15,2)  NOT NULL,
        cost_price    DECIMAL(15,2)  NULL,
        amount        DECIMAL(15,2)  NOT NULL,
        cost_amount   DECIMAL(15,2)  NULL,
        customer_name VARCHAR(200)   NULL,
        description   TEXT           NULL,
        created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_sales_year_month  (year_month),
        INDEX idx_sales_year_month2 (year, month),
        INDEX idx_sales_category    (category_id),
        INDEX idx_sales_product     (product_id),
        INDEX idx_sales_customer    (customer_name),
        INDEX idx_sales_date        (sale_date),
        CONSTRAINT fk_sales_category FOREIGN KEY (category_id) REFERENCES categories(id),
        CONSTRAINT fk_sales_product  FOREIGN KEY (product_id)  REFERENCES products(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS forecasts (
        id                 INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
        year_month         CHAR(7)       NOT NULL,
        year               SMALLINT      NOT NULL,
        month              TINYINT       NOT NULL,
        category_id        INT           NOT NULL,
        forecast_amount    DECIMAL(15,2) NOT NULL,
        forecast_cost_rate DECIMAL(5,4)  NULL,
        notes              TEXT          NULL,
        created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_forecasts_month_category (year_month, category_id),
        INDEX idx_forecasts_year_month (year_month),
        CONSTRAINT fk_forecasts_category FOREIGN KEY (category_id) REFERENCES categories(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        username      VARCHAR(50)  NOT NULL,
        password_hash VARCHAR(100) NOT NULL,
        role          ENUM('admin','manager','viewer') NOT NULL DEFAULT 'viewer',
        display_name  VARCHAR(100) NOT NULL,
        is_active     TINYINT(1)   NOT NULL DEFAULT 1,
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_users_username (username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 初期adminユーザー（admin / Admin1234! で初回ログイン後に変更すること）
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
    conn.release();
  }
}

export default pool;
