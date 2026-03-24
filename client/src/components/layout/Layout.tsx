/**
 * @file Layout.tsx
 * @description 認証済みページの共通レイアウトコンポーネント
 *
 * ## 構成
 * ```
 * <div className="flex h-screen">
 *   <Sidebar />       ← 左固定サイドバー (w-48)
 *   <main>            ← 右メインエリア（スクロール可能）
 *     <Outlet />      ← React Router がページコンポーネントを挿入
 *   </main>
 * </div>
 * ```
 *
 * Outlet は React Router v6 の機能。
 * App.tsx で `<Route path="/" element={<Layout />}>` の子ルートが
 * ここに描画される。
 */

import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

/**
 * 全認証ページ共通のシェルコンポーネント。
 * サイドバーとメインコンテンツエリアを横並びで配置する。
 */
export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* 左サイドバー: 固定幅、ナビゲーション・ユーザー情報を表示 */}
      <Sidebar />
      {/* メインコンテンツエリア: 残り全幅、縦スクロール可能 */}
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
