# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 開発環境の起動

### Docker（推奨）

```bash
# .env ファイルを作成（初回のみ）
cp .env.example .env

# 開発環境起動（ホットリロード有効）
docker compose -f docker-compose.dev.yml up --build

# バックグラウンドで起動
docker compose -f docker-compose.dev.yml up -d

# 本番環境ビルド & 起動
docker compose up --build
```

| サービス | URL |
|---------|-----|
| フロントエンド (dev) | http://localhost:5173 |
| バックエンド API | http://localhost:3001 |
| 本番 (nginx) | http://localhost:80 |
| MySQL | localhost:3306 |

### ローカル直接起動（Docker不使用時）

```bash
# MySQL 8.0 が別途起動済みであること
cd server && npm install && npm run dev   # port 3001
cd client && npm install && npm run dev  # port 5173
```

サーバー側環境変数は `server/.env`（`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`）。

## プロジェクト構成

```
salesPlan/
├── docker-compose.yml          # 本番用
├── docker-compose.dev.yml      # 開発用（ホットリロード）
├── server/                     # Express + TypeScript API サーバー (port 3001)
│   ├── src/
│   │   ├── index.ts            # エントリポイント・ミドルウェア設定
│   │   ├── db.ts               # mysql2 コネクションプール + 起動時スキーマ初期化
│   │   └── routes/             # ルートハンドラ（各ファイルが 1 リソースに対応）
└── client/                     # React + Vite + Tailwind CSS (port 5173)
    ├── nginx.conf              # 本番: /api/* を server:3001 にプロキシ
    └── src/
        ├── api/                # Axios を使ったAPIコール関数（hooks からのみ呼ぶ）
        ├── hooks/              # React Query カスタムフック（データフェッチ・ミューテーション）
        ├── pages/              # ルートに対応するページコンポーネント
        ├── components/         # 再利用コンポーネント（layout/, ui/, charts/）
        ├── types/index.ts      # サーバー・クライアント共通の TypeScript 型
        └── utils/formatters.ts # 日本語ロケール数値・日付フォーマット
```

## アーキテクチャの要点

### データフローの原則
- **ページ → hooks → api/ → Express routes → MySQL** の一方向のみ
- React コンポーネントは直接 `api/` を呼ばず、必ず `hooks/` 経由
- `api/` 関数は Axios インスタンス（`api/client.ts`）のみ使用

### 開発時 API プロキシ
- Vite dev サーバーが `/api/*` を `http://localhost:3001` にプロキシ（`vite.config.ts`）
- 本番は Nginx が同じプロキシを担当（`client/nginx.conf`）
- フロントエンドコードはどちらでも `/api/...` と書くだけでよい

### DB 設計の重要な決定事項

| 決定 | 理由 |
|------|------|
| `DECIMAL(15,2)` で金額を格納 | float/real の丸め誤差を防ぐ |
| `sales` に `year`, `month`, `year_month` を冗長保持 | `GROUP BY year_month` が高速・BIツール連携を容易にする |
| `profit_amount` / `profit_rate` はカラムに持たない | `amount - cost_amount` でクエリ計算し不整合を防ぐ |
| `sales.unit_price` / `cost_price` は取引ごとに実値を記録 | 顧客別・案件別・仕入れ先別・時期別の価格差異をすべて吸収 |
| `forecasts` の upsert は `UNIQUE(year_month, category_id)` で実現 | `INSERT ... ON DUPLICATE KEY UPDATE` パターン |
| ORM 不使用 | 集計クエリ（reports ルート）のチューニングを生SQL で完全制御 |

### テーブル関係

```
categories
  └── products
        ├── product_price_history  (標準価格の改定履歴)
        └── sales                  (product_id は nullable: 製品なし登録も可)
  └── sales    (category_id は必須)
  └── forecasts (月×カテゴリ単位)
```

## API エンドポイント早見表

| パス | 主なクエリパラメータ |
|------|-------------------|
| `GET /api/sales` | `year_month`, `category_id`, `product_id`, `page`, `limit` |
| `GET /api/forecasts` | `year_month` |
| `GET /api/reports/monthly-summary` | `from`, `to`（YYYY-MM形式） |
| `GET /api/reports/month-comparison` | `month1`, `month2` |
| `GET /api/reports/profit-analysis` | `from`, `to`, `category_id`, `product_id` |
| `GET /api/reports/product-ranking` | `year_month`, `limit` |

## 主要パッケージバージョン方針

- **mysql2** — async/await ドライバ（コールバック形式は使わない）
- **tsx** — 開発時に TypeScript を直接実行（コンパイル不要）
- **@tanstack/react-query** — サーバー状態管理（ローカル状態に使わない）
- **recharts** — グラフ描画（ComposedChart で棒グラフ＋折れ線を組み合わせる）
- **react-hook-form + zod** — フォームバリデーション（スキーマ定義は `types/index.ts` と共有）
