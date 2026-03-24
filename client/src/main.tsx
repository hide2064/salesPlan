/**
 * @file main.tsx
 * @description アプリケーションエントリポイント
 *
 * ## プロバイダー構成（外側から内側）
 * React.StrictMode
 *   → QueryClientProvider  : React Query のグローバルキャッシュ管理
 *     → App                : BrowserRouter, AuthProvider, Routes を含む
 *     → Toaster            : react-hot-toast の通知コンテナ（画面右上）
 *
 * ## QueryClient 設定
 * - retry: 1   → APIエラー時に1回だけリトライ（デフォルト3回を削減）
 * - staleTime: 30_000ms → 30秒間はキャッシュを新鮮とみなし再フェッチしない
 *   （同じデータを短時間に複数コンポーネントから参照しても1回しかAPIを叩かない）
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

/** アプリ全体で共有する React Query クライアントインスタンス */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      {/* 通知トースト（右上に表示。toast.success() / toast.error() で呼び出す） */}
      <Toaster position="top-right" />
    </QueryClientProvider>
  </React.StrictMode>
);
