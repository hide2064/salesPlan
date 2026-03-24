# 売上管理システム 設計書

## 1. システム概要

売上実績の入力・集計・月次比較・利益分析を行うWebシステム。
製品ごとの原価・販売価格管理と、顧客・取引先・時期・仕入れ先による価格差異に対応する。

---

## 2. システム構成

```
ブラウザ (React SPA)
  │  HTTP /api/* → Vite dev proxy (開発) / Nginx proxy (本番)
  ▼
Express API サーバー (Node.js / TypeScript)
  │  mysql2/promise
  ▼
MySQL 8.0
```

### Dockerコンテナ構成

| コンテナ | イメージ | ポート | 役割 |
|---------|---------|--------|------|
| sales_mysql | mysql:8.0 | 3306 | データベース |
| sales_server | node:20-alpine | 3001 | APIサーバー |
| sales_client | node:20-alpine (dev) / nginx:alpine (prod) | 5173 / 80 | フロントエンド |

---

## 3. 機能一覧と権限

| 機能 | admin | manager | viewer |
|------|:-----:|:-------:|:------:|
| ダッシュボード閲覧 | ✓ | ✓ | ✓ |
| 売上一覧閲覧 | ✓ | ✓ | ✓ |
| 製品・カテゴリ閲覧 | ✓ | ✓ | ✓ |
| 月別比較・利益分析 | ✓ | ✓ | ✓ |
| 売上入力・編集・削除 | ✓ | ✓ | × |
| 予定売上管理 | ✓ | ✓ | × |
| 製品・カテゴリ管理 | ✓ | ✓ | × |
| CSVインポート | ✓ | ✓ | × |
| ユーザー管理 | ✓ | × | × |

### 初期ユーザー
- ユーザー名: `admin` / パスワード: `Admin1234!`
- ※初回ログイン後に必ず変更すること

---

## 4. データモデル

### テーブル関係

```
users                 ← 認証・権限管理
categories
  └── products        ← カテゴリ配下に製品
        └── product_price_history  ← 標準価格の改定履歴
categories ──── sales          ← 取引ごとに実際の価格を記録
categories ──── forecasts      ← 月×カテゴリ単位の予定売上
products   ──── sales (nullable)
```

### 主要テーブル

#### users
| カラム | 型 | 説明 |
|--------|-----|------|
| id | INT PK | - |
| username | VARCHAR(50) UNIQUE | ログインID |
| password_hash | VARCHAR(100) | bcrypt ハッシュ |
| role | ENUM | admin / manager / viewer |
| display_name | VARCHAR(100) | 表示名 |
| is_active | TINYINT(1) | 有効フラグ |

#### categories
| カラム | 型 | 説明 |
|--------|-----|------|
| id | INT PK | - |
| name | VARCHAR(100) UNIQUE | カテゴリ名 |
| sort_order | INT | 表示順 |
| is_active | TINYINT(1) | 有効フラグ |

#### products
| カラム | 型 | 説明 |
|--------|-----|------|
| id | INT PK | - |
| category_id | INT FK | カテゴリ |
| name | VARCHAR(200) | 製品名 |
| code | VARCHAR(50) UNIQUE | 製品コード |
| unit | VARCHAR(20) | 単位 |
| default_unit_price | DECIMAL(15,2) | 標準販売単価（入力フォーム初期値） |
| default_cost_price | DECIMAL(15,2) | 標準原価（入力フォーム初期値） |

#### product_price_history
| カラム | 型 | 説明 |
|--------|-----|------|
| product_id | INT FK | 製品 |
| valid_from | DATE | 適用開始日 |
| unit_price | DECIMAL(15,2) | 改定後の販売単価 |
| cost_price | DECIMAL(15,2) | 改定後の原価 |
| reason | VARCHAR(500) | 改定理由 |

#### sales（売上実績）
| カラム | 型 | 説明 |
|--------|-----|------|
| sale_date | DATE | 売上日 |
| year / month | SMALLINT / TINYINT | 集計・分析用（冗長保持） |
| year_month | CHAR(7) | "YYYY-MM"（インデックス） |
| category_id | INT FK | カテゴリ（必須） |
| product_id | INT FK nullable | 製品（任意） |
| unit_price | DECIMAL(15,2) | **実際の**販売単価 |
| cost_price | DECIMAL(15,2) | **実際の**原価単価 |
| amount | DECIMAL(15,2) | 売上金額 |
| cost_amount | DECIMAL(15,2) | 原価合計 |
| customer_name | VARCHAR(200) | 顧客・取引先名 |

> **利益 = amount − cost_amount**（保存しない、クエリで計算）
> **利益率 = 利益 / amount × 100**（保存しない、クエリで計算）

#### forecasts（予定売上）
| カラム | 型 | 説明 |
|--------|-----|------|
| year_month | CHAR(7) | 対象年月 |
| category_id | INT FK | カテゴリ |
| forecast_amount | DECIMAL(15,2) | 予定売上金額 |
| forecast_cost_rate | DECIMAL(5,4) | 予定原価率（0.0〜1.0）|

> UNIQUE KEY: `(year_month, category_id)` → upsert 可能

---

## 5. API エンドポイント

### 認証

| Method | Path | ロール | 説明 |
|--------|------|--------|------|
| POST | /api/auth/login | 不要 | ログイン → JWTトークン返却 |
| GET  | /api/auth/me | 全員 | 自分のユーザー情報 |

### マスタ管理

| Method | Path | ロール | 説明 |
|--------|------|--------|------|
| GET | /api/categories | viewer以上 | カテゴリ一覧 |
| POST/PUT/DELETE | /api/categories | manager以上 | カテゴリ登録・更新・無効化 |
| GET | /api/products | viewer以上 | 製品一覧 `?category_id=` |
| POST/PUT/DELETE | /api/products | manager以上 | 製品登録・更新・無効化 |
| GET/POST | /api/products/:id/prices | manager以上 | 価格改定履歴 |

### 売上・予定

| Method | Path | ロール | 説明 |
|--------|------|--------|------|
| GET | /api/sales | viewer以上 | 売上一覧 `?year_month=&category_id=&page=` |
| POST/PUT/DELETE | /api/sales | manager以上 | 売上 CRUD |
| GET | /api/forecasts | viewer以上 | 予定一覧 `?year_month=` |
| POST/PUT/DELETE | /api/forecasts | manager以上 | 予定 CRUD（upsert） |

### レポート

| Path | 主なパラメータ | 説明 |
|------|--------------|------|
| GET /api/reports/monthly-summary | from, to | 月次集計（売上・原価・利益・達成率） |
| GET /api/reports/month-comparison | month1, month2 | 2ヶ月比較 |
| GET /api/reports/actual-vs-forecast | year_month | 実績vs予定（カテゴリ別） |
| GET /api/reports/profit-analysis | from, to, category_id | 利益分析（製品・月次） |
| GET /api/reports/product-ranking | from, to, limit | 製品別ランキング |

### CSV インポート・エクスポート

| Path | ロール | 説明 |
|------|--------|------|
| POST /api/import/sales | manager以上 | CSVデータ（JSON変換済み）のバルクインサート |
| GET /api/export/sales | viewer以上 | 売上データJSON（クライアント側でCSV化） |

---

## 6. 認証フロー

```
1. POST /api/auth/login → JWT トークン返却
2. クライアントが localStorage に保存
3. 以降の /api/* リクエストに Authorization: Bearer {token} を付与
4. サーバー側 authenticate ミドルウェアで検証
5. requireRole() で最低ロールをチェック
6. トークン有効期限: 8時間
```

---

## 7. CSV インポート仕様

### ヘッダ行（必須列: `*`）

```
sale_date*,category_name*,product_name,quantity*,unit_price*,cost_price,amount*,cost_amount,customer_name,description
```

### バリデーションルール

| 列 | ルール |
|----|--------|
| sale_date | YYYY-MM-DD 形式 |
| category_name | DBに存在するカテゴリ名 |
| product_name | DBに存在する製品名（省略可） |
| quantity | 0以上の数値 |
| unit_price | 0以上の数値 |
| amount | 0以上の数値 |

- 最大 1,000 件/リクエスト
- エラー行はスキップして正常行のみインサート（エラー詳細を返却）

---

## 8. 画面一覧

| 画面 | パス | 最低ロール | 主な機能 |
|------|------|-----------|---------|
| ダッシュボード | /dashboard | viewer | KPI・12ヶ月グラフ・当月実績vs予定 |
| 売上入力 | /sales/entry | manager | フォーム入力・利益リアルタイム表示 |
| 売上一覧 | /sales/list | viewer | フィルタ・ページネーション・CSV出力 |
| 製品管理 | /products | manager | カテゴリ→製品ドリルダウン・価格改定履歴 |
| 予定売上管理 | /forecasts | manager | インライン編集・前月コピー |
| 月別比較 | /comparison | viewer | 2ヶ月比較グラフ・増減テーブル |
| 利益分析 | /profit | viewer | 月次トレンド・製品別ランキング |
| ユーザー管理 | /users | admin | ユーザー追加・ロール設定 |

---

## 9. 開発・運用手順

### 環境起動

```bash
cp .env.example .env
# 開発環境
docker compose -f docker-compose.dev.yml up --build
# 本番環境
docker compose up --build
```

### サンプルデータ投入（初回）

```bash
docker exec sales_server npx tsx src/seed.ts
```

### テスト実行

```bash
cd server && npm test
```

### ログ確認

```bash
docker compose -f docker-compose.dev.yml logs -f server
docker compose -f docker-compose.dev.yml logs -f mysql
```
