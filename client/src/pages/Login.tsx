/**
 * @file Login.tsx
 * @description ログインページコンポーネント
 *
 * ## 表示条件
 * 未ログイン時のみ表示される（App.tsx で制御）。
 * ログイン済みの場合は /dashboard にリダイレクト。
 *
 * ## 処理フロー
 * 1. フォーム送信 → AuthContext.login() を呼ぶ
 * 2. 成功 → navigate('/dashboard')
 * 3. 失敗 → エラーメッセージをフォーム内に表示
 *
 * ## セキュリティ
 * - loading 中はボタンを disabled にして二重送信を防止
 * - エラー詳細（ユーザー不存在 vs パスワード不一致）はサーバー側で区別しない
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * ログイン画面。
 * 画面中央に配置したシンプルなフォームのみで構成する。
 */
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  /** フォーム全体のエラーメッセージ */
  const [error, setError] = useState('');
  /** API呼び出し中フラグ（ボタン非活性化・テキスト変更に使用） */
  const [loading, setLoading] = useState(false);

  /** フォーム送信ハンドラ */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-md p-8 w-80">
        <h1 className="text-xl font-bold text-gray-800 text-center mb-6">売上管理システム</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ユーザー名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {/* エラーメッセージ（認証失敗時のみ表示） */}
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
        {/* 初期認証情報の案内（開発・初期セットアップ用） */}
        <p className="text-xs text-gray-400 text-center mt-4">
          初期: admin / Admin1234!
        </p>
      </div>
    </div>
  );
}
