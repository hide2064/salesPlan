import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export type Role = 'admin' | 'manager' | 'viewer';

export interface JwtPayload {
  userId: number;
  username: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production-secret';
export const JWT_EXPIRES_IN = '8h';

/** JWTトークンを検証し req.user にセット */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '認証が必要です' });
  }
  try {
    const token = header.substring(7);
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'トークンが無効または期限切れです' });
  }
}

/**
 * 必要ロールを持つユーザーのみ通過
 * admin > manager > viewer の階層
 */
const ROLE_LEVEL: Record<Role, number> = { admin: 3, manager: 2, viewer: 1 };

export function requireRole(minRole: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: '認証が必要です' });
    if (ROLE_LEVEL[req.user.role] < ROLE_LEVEL[minRole]) {
      return res.status(403).json({ error: `この操作には ${minRole} 以上の権限が必要です` });
    }
    next();
  };
}
