/**
 * @file users.ts
 * @description 認証・ユーザー管理ルート
 *
 * ## エンドポイント一覧
 * | メソッド | パス             | 認証        | 説明                         |
 * |---------|-----------------|-------------|------------------------------|
 * | POST    | /api/auth/login  | 不要        | ログイン・JWTトークン発行      |
 * | GET     | /api/auth/me     | JWT必須     | 自分のユーザー情報取得         |
 * | GET     | /api/users       | admin のみ  | 全ユーザー一覧取得             |
 * | POST    | /api/users       | admin のみ  | 新規ユーザー作成              |
 * | PUT     | /api/users/:id   | admin のみ  | ユーザー情報更新・パスワード変更 |
 *
 * ## JWT認証フロー
 * 1. POST /api/auth/login でトークン取得
 * 2. 以降のリクエストは Authorization: Bearer <token> ヘッダを付与
 * 3. authenticate ミドルウェアがトークンを検証し req.user にデコード情報をセット
 * 4. requireRole('admin') が req.user.role を確認してアクセス制御
 *
 * ## パスワードのセキュリティ
 * - bcryptjs (コスト係数 10) でハッシュ化してDBに保存
 * - 平文パスワードは一切保持しない
 * - 比較は bcrypt.compare のみ（タイミング攻撃対策済み）
 *
 * ## ロール設計
 * - admin:   全機能 + ユーザー管理
 * - manager: 売上入力・製品管理・予定管理・CSV取込
 * - viewer:  全画面の閲覧のみ
 */

import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db';
import { authenticate, requireRole, JWT_SECRET, JWT_EXPIRES_IN } from '../auth';
import type { Role } from '../auth';

const router = Router();

// ────────────────────────────────────────────
// POST /api/auth/login
// ────────────────────────────────────────────
/**
 * ログイン認証・JWTトークン発行
 *
 * バリデーション:
 * - username: 空でない文字列（trim済み）
 * - password: 空でない文字列
 *
 * 処理フロー:
 * 1. username でアクティブユーザーを検索
 * 2. bcrypt.compare でパスワードを検証
 * 3. 検証OK → JWTトークンを生成して返す
 *
 * セキュリティ注意:
 * - "ユーザーが存在しない" と "パスワードが違う" を区別しない（列挙攻撃対策）
 *
 * レスポンス:
 * - 200: { token, user: { id, username, role, display_name } }
 * - 400: バリデーションエラー
 * - 401: 認証失敗
 */
router.post(
  '/login',
  [
    body('username').notEmpty().trim(),
    body('password').notEmpty(),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, password } = req.body;
    // is_active = 1 の条件で無効化ユーザーはログイン拒否
    const [rows]: any = await pool.query(
      'SELECT id, username, password_hash, role, display_name FROM users WHERE username = ? AND is_active = 1',
      [username]
    );
    // ユーザー不在もパスワード不一致も同じメッセージを返す（列挙攻撃対策）
    if (rows.length === 0) return res.status(401).json({ error: 'ユーザー名またはパスワードが違います' });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'ユーザー名またはパスワードが違います' });

    // JWTペイロードには最小限の情報のみ含める（userId, username, role）
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, display_name: user.display_name },
    });
  }
);

// ────────────────────────────────────────────
// GET /api/auth/me  (自分の情報)
// ────────────────────────────────────────────
/**
 * 認証済みユーザー自身の情報を取得する。
 * フロントエンドが画面リロード時に localStorage のトークンを検証するために使用。
 * トークンが有効でもユーザーが削除・無効化された場合は 404 を返す。
 *
 * レスポンス:
 * - 200: { id, username, role, display_name, created_at }
 * - 401: 未認証（authenticate ミドルウェアが返す）
 * - 404: ユーザーが存在しない（トークン発行後に削除された場合）
 */
router.get('/me', authenticate, async (req: any, res: any) => {
  const [rows]: any = await pool.query(
    'SELECT id, username, role, display_name, created_at FROM users WHERE id = ?',
    [req.user.userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// ────────────────────────────────────────────
// GET /api/users  (admin only)
// ────────────────────────────────────────────
/**
 * 全ユーザー一覧取得（管理者専用）。
 * パスワードハッシュは除外して返す。
 *
 * レスポンス:
 * - 200: User[] (id, username, role, display_name, is_active, created_at)
 * - 401: 未認証
 * - 403: admin 以外のロール（requireRole が返す）
 */
router.get('/', authenticate, requireRole('admin'), async (_req, res) => {
  const [rows] = await pool.query(
    'SELECT id, username, role, display_name, is_active, created_at FROM users ORDER BY id'
  );
  res.json(rows);
});

// ────────────────────────────────────────────
// POST /api/users  (admin only)
// ────────────────────────────────────────────
/**
 * 新規ユーザー作成（管理者専用）。
 *
 * バリデーション:
 * - username: 3〜50文字
 * - password: 6文字以上
 * - role: 'admin' | 'manager' | 'viewer' のいずれか
 * - display_name: 任意、最大100文字
 *
 * 処理:
 * - password を bcrypt (コスト10) でハッシュ化してDBに保存
 * - display_name 省略時は username をデフォルト値として使用
 * - username 重複時は ER_DUP_ENTRY → 409 Conflict を返す
 *
 * レスポンス:
 * - 201: 作成されたユーザー情報（password_hash は除外）
 * - 400: バリデーションエラー
 * - 401/403: 未認証 or 権限不足
 * - 409: ユーザー名重複
 */
router.post(
  '/',
  authenticate,
  requireRole('admin'),
  [
    body('username').notEmpty().trim().isLength({ min: 3, max: 50 }),
    body('password').isLength({ min: 6 }),
    body('role').isIn(['admin', 'manager', 'viewer']),
    body('display_name').optional().trim().isLength({ max: 100 }),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, password, role, display_name } = req.body;
    // コスト係数 10: セキュリティとパフォーマンスのバランス（本番環境での標準値）
    const hash = await bcrypt.hash(password, 10);
    try {
      const [result]: any = await pool.query(
        'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)',
        [username, hash, role as Role, display_name ?? username]
      );
      // INSERT直後に SELECT して最新レコードを返す（created_atなどのDB生成値を含む）
      const [rows]: any = await pool.query(
        'SELECT id, username, role, display_name, is_active FROM users WHERE id = ?',
        [result.insertId]
      );
      res.status(201).json(rows[0]);
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'ユーザー名が重複しています' });
      throw err;
    }
  }
);

// ────────────────────────────────────────────
// PUT /api/users/:id  (admin only)
// ────────────────────────────────────────────
/**
 * ユーザー情報更新（管理者専用）。
 * 動的フィールド更新パターン：更新対象フィールドのみをSQLに含める。
 *
 * 更新可能フィールド:
 * - role: 'admin' | 'manager' | 'viewer'
 * - display_name: 最大100文字
 * - is_active: boolean (有効/無効切り替え)
 * - password: 6文字以上（指定時のみ再ハッシュ化）
 *
 * 処理フロー:
 * 1. リクエストボディの各フィールドを確認
 * 2. 存在するフィールドのみ fields[] / values[] に追加
 * 3. `UPDATE users SET field=?, ... WHERE id=?` を動的構築して実行
 *
 * レスポンス:
 * - 200: 更新後のユーザー情報
 * - 400: バリデーションエラー or 更新フィールドなし
 * - 401/403: 未認証 or 権限不足
 */
router.put(
  '/:id',
  authenticate,
  requireRole('admin'),
  [
    body('role').optional().isIn(['admin', 'manager', 'viewer']),
    body('display_name').optional().trim().isLength({ max: 100 }),
    body('is_active').optional().isBoolean(),
    body('password').optional().isLength({ min: 6 }),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    // 動的UPDATE: 送信されたフィールドのみをSETに含める
    const fields: string[] = [];
    const values: any[] = [];

    if (req.body.role !== undefined) { fields.push('role = ?'); values.push(req.body.role); }
    if (req.body.display_name !== undefined) { fields.push('display_name = ?'); values.push(req.body.display_name); }
    if (req.body.is_active !== undefined) { fields.push('is_active = ?'); values.push(req.body.is_active ? 1 : 0); }
    if (req.body.password) {
      // パスワード変更時は再ハッシュ化
      const hash = await bcrypt.hash(req.body.password, 10);
      fields.push('password_hash = ?');
      values.push(hash);
    }
    if (fields.length === 0) return res.status(400).json({ error: '更新フィールドがありません' });

    // WHERE id=? のために values の末尾にIDを追加
    values.push(req.params.id);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    // 更新後のレコードを取得して返す
    const [rows]: any = await pool.query(
      'SELECT id, username, role, display_name, is_active FROM users WHERE id = ?',
      [req.params.id]
    );
    res.json(rows[0]);
  }
);

export default router;
