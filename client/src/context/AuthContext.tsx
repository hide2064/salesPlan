/**
 * @file AuthContext.tsx
 * @description 認証状態のグローバル管理コンテキスト
 *
 * ## 責務
 * - JWTトークンの localStorage への保存・復元・削除
 * - Axios デフォルトヘッダへの Authorization ヘッダのセット・削除
 * - ログイン・ログアウト処理の提供
 * - ロールベースの操作権限チェック（can 関数）
 *
 * ## トークン永続化の流れ
 * 1. ログイン: token を localStorage['sales_token'] に保存
 * 2. ページリロード: useEffect で localStorage から token を読み出し
 *    → fetchMe() でトークンの有効性を確認してユーザー情報を復元
 *    → 無効なら localStorage をクリアしてログイン画面へ
 * 3. ログアウト: localStorage を削除し Axios ヘッダもクリア
 *
 * ## ロール設計
 * - admin   : 全機能 + ユーザー管理
 * - manager : 売上入力・製品管理・予定管理・CSV取込（write権限）
 * - viewer  : 全画面閲覧のみ（write不可）
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api/client';
import { login as apiLogin, fetchMe } from '../api/auth';
import type { User } from '../api/auth';

/** AuthContext が提供する値の型 */
interface AuthContextValue {
  /** 現在のログインユーザー情報（未ログイン時は null） */
  user: User | null;
  /** トークン検証中フラグ（true の間は認証状態が未確定） */
  isLoading: boolean;
  /** ログイン処理（成功するまで reject される） */
  login: (username: string, password: string) => Promise<void>;
  /** ログアウト処理（即時） */
  logout: () => void;
  /**
   * 操作権限チェック関数
   * @param action 'write': manager以上 / 'admin': adminのみ
   */
  can: (action: 'write' | 'admin') => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** localStorage のキー名（他のアプリと衝突しない名前に） */
const TOKEN_KEY = 'sales_token';

/**
 * 認証コンテキストプロバイダー。
 * アプリ全体を囲む形で配置する（App.tsx の BrowserRouter 直下）。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  /** 初回マウント時のトークン検証が完了するまで true */
  const [isLoading, setIsLoading] = useState(true);

  /**
   * 初回マウント時: localStorage にトークンがあれば fetchMe() で検証・復元する。
   * トークンが無効（期限切れ・改ざん）な場合は localStorage をクリアする。
   */
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      // Axios のデフォルトヘッダにセットして全リクエストに認証情報を付与
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchMe()
        .then(setUser)
        .catch(() => {
          // トークンが無効なら削除してクリーンな状態に
          localStorage.removeItem(TOKEN_KEY);
          delete api.defaults.headers.common['Authorization'];
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  /**
   * ログイン処理。
   * 成功時: トークンを localStorage に保存し、Axios ヘッダに付与してユーザー情報をセット。
   * 失敗時: Error をそのまま throw して呼び出し元（Login.tsx）でハンドリング。
   */
  const login = async (username: string, password: string) => {
    const res = await apiLogin(username, password);
    localStorage.setItem(TOKEN_KEY, res.token);
    api.defaults.headers.common['Authorization'] = `Bearer ${res.token}`;
    setUser(res.user as User);
  };

  /**
   * ログアウト処理。
   * localStorage のトークンと Axios ヘッダを削除し、ユーザー状態をリセットする。
   * React Router がユーザー null を検知してログイン画面にリダイレクトする。
   */
  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
  };

  /**
   * 操作権限チェック。
   * - 'write': manager以上（viewer は閲覧のみ。売上入力・編集・削除不可）
   * - 'admin': admin のみ（ユーザー管理画面へのアクセス）
   */
  const can = (action: 'write' | 'admin'): boolean => {
    if (!user) return false;
    if (action === 'admin') return user.role === 'admin';
    return user.role === 'admin' || user.role === 'manager';
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * AuthContext を使用するカスタムフック。
 * AuthProvider の外で呼ぶと Error を throw する（意図しない使用を防ぐ）。
 *
 * @returns AuthContextValue
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
