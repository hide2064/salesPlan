/**
 * @file auth.ts
 * @description 認証・ユーザー管理APIコール関数と型定義
 *
 * ## 認証フロー
 * 1. login() → JWTトークンを取得
 * 2. AuthContext がトークンを localStorage に保存 & Axiosデフォルトヘッダにセット
 * 3. 以降の全APIリクエストに `Authorization: Bearer <token>` が自動付与される
 * 4. ページリロード時: localStorage からトークンを復元し、fetchMe() で有効性確認
 *
 * ## ユーザー管理API
 * fetchUsers / createUser / updateUser は admin ロールのみアクセス可能。
 * 権限不足の場合はサーバーが 403 を返し、Axiosインターセプターが Error に変換する。
 */

import api from './client';

/**
 * ログイン成功時のレスポンス型
 */
export interface LoginResponse {
  /** JWTトークン（以降のリクエストに使用） */
  token: string;
  /** ログインしたユーザーの基本情報 */
  user: { id: number; username: string; role: string; display_name: string };
}

/**
 * ユーザー情報型。
 * APIレスポンスとして使用する（クライアント側の表示用）。
 * is_active / created_at は管理画面でのみ使用するため optional。
 */
export interface User {
  id: number;
  username: string;
  /** 操作権限を決定するロール */
  role: 'admin' | 'manager' | 'viewer';
  /** 画面表示用の名前（username と異なる場合あり） */
  display_name: string;
  /** アカウント有効フラグ（0=無効, 1=有効） */
  is_active?: number;
  created_at?: string;
}

/**
 * ユーザー名・パスワードでログインし JWTトークンを取得する。
 *
 * @param username - ユーザー名
 * @param password - パスワード（平文）
 * @returns LoginResponse — token と user 情報
 * @throws Error — 認証失敗時（ユーザー不存在・パスワード不一致）
 */
export const login = (username: string, password: string) =>
  api.post<LoginResponse>('/auth/login', { username, password }).then((r) => r.data);

/**
 * 認証済みの自分自身のユーザー情報を取得する。
 * ページリロード時のトークン検証・ユーザー情報復元に使用。
 *
 * @returns User — 自分のユーザー情報
 * @throws Error — トークン無効・期限切れ時
 */
export const fetchMe = () =>
  api.get<User>('/auth/me').then((r) => r.data);

/**
 * 全ユーザー一覧を取得する（admin専用）。
 *
 * @returns User[] — 全ユーザーの配列（パスワードハッシュは除外）
 * @throws Error — admin以外は403
 */
export const fetchUsers = () =>
  api.get<User[]>('/users').then((r) => r.data);

/**
 * 新規ユーザーを作成する（admin専用）。
 *
 * @param data.username     - ユーザー名（3〜50文字）
 * @param data.password     - 初期パスワード（6文字以上）
 * @param data.role         - ロール ('admin' | 'manager' | 'viewer')
 * @param data.display_name - 表示名（省略時はusernameを使用）
 * @returns 作成されたユーザー情報
 * @throws Error — ユーザー名重複(409)・バリデーションエラー(400)
 */
export const createUser = (data: { username: string; password: string; role: string; display_name?: string }) =>
  api.post<User>('/users', data).then((r) => r.data);

/**
 * ユーザー情報を更新する（admin専用）。
 * 指定したフィールドのみ更新（部分更新）。
 * password を含めた場合はサーバー側でbcryptハッシュ化される。
 *
 * @param id   - 更新対象ユーザーID
 * @param data - 更新フィールド（role / display_name / is_active / password）
 * @returns 更新後のユーザー情報
 */
export const updateUser = (id: number, data: Partial<User & { password: string }>) =>
  api.put<User>(`/users/${id}`, data).then((r) => r.data);
