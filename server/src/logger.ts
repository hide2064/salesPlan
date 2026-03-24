/**
 * logger.ts
 * ─────────────────────────────────────────────────────────────
 * Winston を使った構造化ログモジュール。
 *
 * 出力先:
 *   - コンソール (開発時は色付き、本番時はJSON形式)
 *   - logs/app.log   : INFO以上の全ログ（最大20MB × 5世代 ローテーション）
 *   - logs/error.log : ERROR以上のみ（最大20MB × 5世代 ローテーション）
 *
 * 使い方:
 *   import logger from './logger';
 *   logger.info('Server started', { port: 3001 });
 *   logger.warn('Slow query', { sql, durationMs: 123 });
 *   logger.error('DB connection failed', { error: err.message });
 *
 * ログレベル (winston デフォルト):
 *   error(0) > warn(1) > info(2) > http(3) > verbose(4) > debug(5) > silly(6)
 * ─────────────────────────────────────────────────────────────
 */
import winston from 'winston';
import path from 'path';
import fs from 'fs';

// ── ログディレクトリの確保 ──────────────────────────────────────
// /app/logs (Docker内) または ./logs (ローカル実行) に書き出す
const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ── カスタムフォーマット: 日本時間タイムスタンプ ──────────────────
const jstTimestamp = winston.format.timestamp({
  format: () => {
    // Node.js の Date は UTC 基準なので +9h して JST 表示
    return new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .replace('T', ' ')
      .replace('Z', ' JST');
  },
});

// ── コンソール用フォーマット (人間が読みやすい色付き出力) ─────────
const consoleFormat = winston.format.combine(
  jstTimestamp,
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    // メタ情報がある場合のみ付加 (空オブジェクトは表示しない)
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `${timestamp} [${level}] ${message}${metaStr}`;
  }),
);

// ── ファイル用フォーマット (JSON形式、ログ解析ツールと相性◎) ──────
const fileFormat = winston.format.combine(
  jstTimestamp,
  winston.format.errors({ stack: true }), // Error オブジェクトのスタックトレース展開
  winston.format.json(),
);

// ── ロガーインスタンス生成 ─────────────────────────────────────
const logger = winston.createLogger({
  // 環境変数 LOG_LEVEL で制御可 (未設定時: 開発=debug / 本番=info)
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),

  transports: [
    // コンソール出力 (常時)
    new winston.transports.Console({
      format: consoleFormat,
    }),

    // ファイル出力: 全ログ (INFO以上)
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'app.log'),
      level: 'info',
      format: fileFormat,
      maxsize: 20 * 1024 * 1024, // 20MB
      maxFiles: 5,               // 5世代保持
      tailable: true,            // 最新ファイルを固定名 app.log で保持
    }),

    // ファイル出力: エラーのみ (ERROR以上)
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 20 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
  ],
});

export default logger;
