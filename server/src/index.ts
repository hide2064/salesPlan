/**
 * index.ts
 * ─────────────────────────────────────────────────────────────
 * Express アプリケーションのエントリポイント。
 *
 * 起動順:
 *   1. ミドルウェア登録 (CORS, JSON parser, morgan HTTPログ)
 *   2. ルート登録 (認証不要 → 認証必須 → ロール別)
 *   3. グローバルエラーハンドラ登録
 *   4. DB スキーマ初期化 (initSchema)
 *   5. ポートLISTEN開始
 *
 * ポート: 環境変数 PORT (デフォルト 3001)
 * ─────────────────────────────────────────────────────────────
 */
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { initSchema } from './db';
import { authenticate, requireRole } from './auth';
import logger from './logger';

// ── ルーターインポート ──────────────────────────────────────────
import usersRouter       from './routes/users';        // 認証 + ユーザー管理
import categoriesRouter  from './routes/categories';   // カテゴリ管理
import productsRouter    from './routes/products';     // 製品マスタ管理
import salesRouter       from './routes/sales';        // 売上CRUD
import forecastsRouter   from './routes/forecasts';    // 予定売上CRUD
import reportsRouter     from './routes/reports';      // 集計・分析レポート
import importExportRouter from './routes/importExport'; // CSVインポート・エクスポート
import salePlansRouter    from './routes/salePlans';    // 売上予定案件CRUD

const app = express();
const PORT = process.env.PORT || 3001;

// ─────────────────────────────────────────────────────────────
// ミドルウェア設定
// ─────────────────────────────────────────────────────────────

/**
 * CORS: 全オリジンを許可 (開発環境想定)
 * 本番環境では origin を制限すること
 * 例: cors({ origin: 'https://your-domain.com' })
 */
app.use(cors());

/**
 * JSON ボディパーサー
 * limit: 5MB → CSVインポート時の大きいペイロードに対応
 */
app.use(express.json({ limit: '5mb' }));

/**
 * morgan: HTTPリクエストログ
 * winston の http レベルにストリームして一元管理する。
 * フォーマット 'combined' = Apache Combined Log Format
 * 例: ::1 - admin [24/Mar/2026:10:00:00 +0000] "GET /api/sales HTTP/1.1" 200 1234
 */
app.use(morgan('combined', {
  stream: {
    // morgan の write() → winston の http ログに転送 (\n を除去)
    write: (message: string) => logger.http(message.trim()),
  },
}));

// ─────────────────────────────────────────────────────────────
// ルート登録
// ─────────────────────────────────────────────────────────────

/**
 * 認証不要: ログイン・トークン検証
 * POST /api/auth/login  → JWTトークン発行
 * GET  /api/auth/me     → 自分のユーザー情報
 */
app.use('/api/auth', usersRouter);

/**
 * 認証必須: /api/* 以降はすべて authenticate ミドルウェアを通過
 * authenticate: Authorizationヘッダの Bearer トークンを検証し
 *               req.user = { userId, username, role } をセット
 */
app.use('/api', authenticate);

/**
 * ユーザー管理 API
 * GET  /api/users      → ユーザー一覧 (admin のみ)
 * POST /api/users      → ユーザー追加 (admin のみ)
 * PUT  /api/users/:id  → ユーザー更新 (admin のみ)
 * ※ ロールチェックはルーター内部で実施
 */
app.use('/api/users', usersRouter);

/**
 * 参照系 API (viewer 以上で利用可)
 * 各ルーターは authenticate 済みリクエストのみ受け付ける
 */
app.use('/api/categories', categoriesRouter);  // カテゴリ一覧・管理
app.use('/api/products',   productsRouter);    // 製品一覧・管理・価格改定履歴
app.use('/api/reports',    reportsRouter);     // 月次集計・比較・利益分析
app.use('/api/export',     importExportRouter); // 売上データ JSON エクスポート

/**
 * 書き込み系 API (manager 以上で利用可)
 * requireRole('manager') が通過しないと 403 Forbidden を返す
 */
app.use('/api/sales',       requireRole('manager'), salesRouter);       // 売上CRUD
app.use('/api/forecasts',   requireRole('manager'), forecastsRouter);   // 予定売上CRUD
app.use('/api/import',      requireRole('manager'), importExportRouter); // CSVインポート
app.use('/api/sale-plans',  requireRole('manager'), salePlansRouter);   // 売上予定案件

// ─────────────────────────────────────────────────────────────
// グローバルエラーハンドラ
// ─────────────────────────────────────────────────────────────
/**
 * Express の4引数エラーハンドラ。
 * ルート内でキャッチされなかった例外をここで受け取る。
 * スタックトレースを error ログに記録し、クライアントには汎用メッセージを返す
 * (内部情報をレスポンスに含めないセキュリティ対策)。
 */
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ─────────────────────────────────────────────────────────────
// サーバー起動
// ─────────────────────────────────────────────────────────────
async function start() {
  try {
    logger.info('Initializing database schema...');
    await initSchema();
    logger.info('Database schema initialized.');

    app.listen(PORT, () => {
      logger.info(`Server listening on port ${PORT}`, {
        port: PORT,
        env: process.env.NODE_ENV || 'development',
      });
    });
  } catch (err) {
    logger.error('Failed to start server', { error: (err as Error).message });
    process.exit(1);
  }
}

start();

export default app;
