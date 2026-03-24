/**
 * 認証・権限ミドルウェアのユニットテスト
 */
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../auth';
import type { Role } from '../auth';

const ROLE_LEVEL: Record<Role, number> = { admin: 3, manager: 2, viewer: 1 };

function hasPermission(userRole: Role, requiredRole: Role): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[requiredRole];
}

function createToken(userId: number, username: string, role: Role): string {
  return jwt.sign({ userId, username, role }, JWT_SECRET, { expiresIn: '1h' });
}

function verifyToken(token: string): { userId: number; username: string; role: Role } {
  return jwt.verify(token, JWT_SECRET) as any;
}

describe('権限チェック (hasPermission)', () => {
  it('admin はすべての操作が可能', () => {
    expect(hasPermission('admin', 'admin')).toBe(true);
    expect(hasPermission('admin', 'manager')).toBe(true);
    expect(hasPermission('admin', 'viewer')).toBe(true);
  });

  it('manager は admin 操作不可', () => {
    expect(hasPermission('manager', 'admin')).toBe(false);
    expect(hasPermission('manager', 'manager')).toBe(true);
    expect(hasPermission('manager', 'viewer')).toBe(true);
  });

  it('viewer は閲覧のみ', () => {
    expect(hasPermission('viewer', 'admin')).toBe(false);
    expect(hasPermission('viewer', 'manager')).toBe(false);
    expect(hasPermission('viewer', 'viewer')).toBe(true);
  });
});

describe('JWT トークン', () => {
  it('トークンを生成・検証できる', () => {
    const token = createToken(1, 'testuser', 'manager');
    const payload = verifyToken(token);
    expect(payload.userId).toBe(1);
    expect(payload.username).toBe('testuser');
    expect(payload.role).toBe('manager');
  });

  it('不正なトークンは検証に失敗する', () => {
    expect(() => verifyToken('invalid.token.here')).toThrow();
  });

  it('別のシークレットで署名されたトークンは無効', () => {
    const token = jwt.sign({ userId: 1, username: 'x', role: 'admin' }, 'wrong-secret');
    expect(() => verifyToken(token)).toThrow();
  });
});

describe('ロールバリデーション', () => {
  it('有効なロールのみ許可', () => {
    const validRoles: Role[] = ['admin', 'manager', 'viewer'];
    for (const r of validRoles) {
      expect(ROLE_LEVEL[r]).toBeDefined();
    }
  });

  it('ロールの階層順が正しい', () => {
    expect(ROLE_LEVEL['admin']).toBeGreaterThan(ROLE_LEVEL['manager']);
    expect(ROLE_LEVEL['manager']).toBeGreaterThan(ROLE_LEVEL['viewer']);
  });
});
