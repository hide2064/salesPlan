/**
 * @file client.ts
 * @description Axios インスタンスの共通設定
 *
 * ## 設計方針
 * - baseURL を '/api' に固定することで、フロントエンドコードはパスの先頭 '/api' を意識不要
 * - 開発時: Vite の proxy が /api/* を http://localhost:3001 にフォワード
 * - 本番時: Nginx の proxy_pass が /api/* を http://server:3001 にフォワード
 * - どちらの環境でも同じコードが動く
 *
 * ## エラーハンドリング
 * - レスポンスインターセプターでサーバーのエラーレスポンスを統一的な Error に変換
 * - error.response?.data?.error: 単一エラーメッセージ（バックエンドの { error: '...' }）
 * - error.response?.data?.errors?.[0]?.msg: express-validator の配列エラー
 * - err.message: ネットワークエラーなどの場合のフォールバック
 *
 * ## 認証トークンの付与
 * - ログイン成功後に AuthContext が api.defaults.headers.common['Authorization'] をセット
 * - ログアウト時に AuthContext が同ヘッダを削除
 * - このファイルでは認証設定をせず、AuthContext に委譲している
 */

import axios from 'axios';

/**
 * アプリ全体で共有する Axios インスタンス。
 * api/ 配下の全関数はこのインスタンスのみを使用する（直接 axios.get() 等は呼ばない）。
 */
const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

/**
 * レスポンスインターセプター：APIエラーを統一的な Error オブジェクトに変換する。
 * 呼び出し元（hooks）では catch (e: Error) で e.message を表示するだけでよい。
 */
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || err.message;
    return Promise.reject(new Error(msg));
  }
);

export default api;
