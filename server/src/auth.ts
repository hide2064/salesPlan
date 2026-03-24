/**
 * auth.ts
 * ─────────────────────────────────────────────────────────────
 * JWT 認証ミドルウェアとロールベースアクセス制御 (RBAC) を提供するモジュール。
 *
 * 認証フロー:
 *   1. クライアントが POST /api/auth/login でユーザー名・パスワードを送信
 *   2. サーバーが bcrypt でパスワード検証 → JWT トークンを発行 (8時間有効)
 *   3. 以降のリクエストで Authorization: Bearer {token} ヘッダを付与
 *   4. authenticate ミドルウェアがトークンを検証 → req.user にペイロードをセット
 *   5. requireRole() で必要ロールをチェック
 *
 * ロール階層:
 *   admin (3) > manager (2) > viewer (1)
 *   上位ロールは下位ロールのすべての操作が可能。
 *
 * 環境変数:
 *   JWT_SECRET : JWTの署名秘密鍵 (必ず本番では変更すること)
 * ─────────────────────────────────────────────────────────────
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * ロール型
 * 3種類のロールのみを受け付けるリテラル型。
 */
export type Role = 'admin' | 'manager' | 'viewer';

/**
 * JwtPayload
 * JWT のペイロードに格納するユーザー情報。
 * jwt.sign() で署名し、jwt.verify() でデコードして取得する。
 */
export interface JwtPayload {
  userId: number;    // users.id
  username: string;  // ログインID
  role: Role;        // ユーザーのロール
}

/**
 * Express の Request 型を拡張して req.user を型安全に使用できるようにする。
 * authenticate ミドルウェア通過後は req.user が必ず存在する。
 */
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * JWT 署名秘密鍵
 * 環境変数 JWT_SECRET が設定されていない場合はデフォルト値を使用。
 * ⚠️  本番環境では必ず強力なランダム文字列に変更すること。
 * 例: openssl rand -base64 64
 */
export const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production-secret';

/**
 * トークン有効期限: 8時間
 * ブラウザを閉じてから8時間以内は再ログイン不要。
 */
export const JWT_EXPIRES_IN = '8h';

/**
 * authenticate ミドルウェア
 * ─────────────────────────────────────────────────────────────
 * リクエストの Authorization ヘッダから Bearer トークンを取り出し、
 * JWT を検証して req.user にデコードされたペイロードをセットする。
 *
 * エラーケース:
 *   - Authorization ヘッダが存在しない → 401
 *   - "Bearer " で始まらない          → 401
 *   - トークンの署名が不正            → 401
 *   - トークンの有効期限切れ          → 401
 *
 * 成功時: next() を呼んで次のミドルウェアへ。
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  // Authorization ヘッダの存在チェック
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  try {
    // "Bearer " の7文字を除いたトークン部分を取得
    const token = header.substring(7);

    // JWT 検証: 署名・有効期限を同時チェック
    // 不正な場合は JsonWebTokenError または TokenExpiredError がスローされる
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;

    // 以降のミドルウェア・ルートハンドラで req.user として参照可能
    req.user = payload;
    next();
  } catch {
    // 署名不正・期限切れ両方をまとめて401で返す
    // (どちらのエラーかをクライアントに伝えない → セキュリティ対策)
    res.status(401).json({ error: 'トークンが無効または期限切れです' });
  }
}

/**
 * ロール階層の数値マッピング
 * 数値が大きいほど上位ロール。
 * hasPermission(userRole, requiredRole) = ROLE_LEVEL[userRole] >= ROLE_LEVEL[requiredRole]
 */
const ROLE_LEVEL: Record<Role, number> = { admin: 3, manager: 2, viewer: 1 };

/**
 * requireRole ミドルウェアファクトリ
 * ─────────────────────────────────────────────────────────────
 * 指定したロール以上のユーザーのみ通過させるミドルウェアを生成する。
 *
 * 使い方:
 *   router.post('/sales', requireRole('manager'), handler);
 *   // → viewer がアクセスすると 403 を返す
 *   // → manager / admin はそのまま handler に進む
 *
 * @param minRole - 最低限必要なロール
 * @returns Express ミドルウェア関数
 */
export function requireRole(minRole: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    // authenticate が先に実行されていることを前提とする
    if (!req.user) {
      return res.status(401).json({ error: '認証が必要です' });
    }

    // ユーザーのロールレベルが必要レベルを下回る場合は禁止
    if (ROLE_LEVEL[req.user.role] < ROLE_LEVEL[minRole]) {
      return res.status(403).json({ error: `この操作には ${minRole} 以上の権限が必要です` });
    }

    next();
  };
}
