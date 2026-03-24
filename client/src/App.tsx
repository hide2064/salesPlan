/**
 * @file App.tsx
 * @description アプリケーションルート・ルーティング定義
 *
 * ## ルート構造
 * ```
 * /login               → Login（未ログインのみ。ログイン済みなら /dashboard へ）
 * / (RequireAuth)
 *   /dashboard         → Dashboard
 *   /sales/entry       → SalesEntry（write権限必要）
 *   /sales/list        → SalesList
 *   /products          → ProductManagement
 *   /forecasts         → ForecastManagement
 *   /comparison        → Comparison
 *   /profit            → ProfitAnalysis
 *   /users (RequireAdmin) → UserManagement（admin のみ）
 * ```
 *
 * ## 認証ガード
 * - RequireAuth: 未ログイン時は /login にリダイレクト
 * - RequireAdmin: admin以外は /dashboard にリダイレクト
 * - どちらも isLoading 中はスピナーを表示（認証確認前にリダイレクトしない）
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SalesEntry from './pages/SalesEntry';
import SalesList from './pages/SalesList';
import ProductManagement from './pages/ProductManagement';
import ForecastManagement from './pages/ForecastManagement';
import Comparison from './pages/Comparison';
import ProfitAnalysis from './pages/ProfitAnalysis';
import UserManagement from './pages/UserManagement';
import LoadingSpinner from './components/ui/LoadingSpinner';

/**
 * 認証ガード: 未ログイン時はログイン画面にリダイレクトする。
 * isLoading 中はスピナーを表示してリダイレクトを抑制する
 * （ページリロード時のトークン検証完了を待つ）。
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner text="認証確認中..." />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * 管理者ガード: admin 以外はダッシュボードにリダイレクトする。
 * RequireAuth の内側に配置するため、isLoading チェック不要。
 */
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can('admin')) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/**
 * アプリのルーティング定義。
 * AuthProvider 配下に配置されているため useAuth が使用可能。
 */
function AppRoutes() {
  const { user, isLoading } = useAuth();
  // 初回起動時（認証確認中）はアプリ起動スピナーを表示
  if (isLoading) return <LoadingSpinner text="起動中..." />;

  return (
    <Routes>
      {/* ログイン済みの場合は /login にアクセスしても /dashboard へ */}
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />

      {/* 認証済みユーザー向けルート: Layout（サイドバー+メインエリア）でラップ */}
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="sales/entry" element={<SalesEntry />} />
        <Route path="sales/list" element={<SalesList />} />
        <Route path="products" element={<ProductManagement />} />
        <Route path="forecasts" element={<ForecastManagement />} />
        <Route path="comparison" element={<Comparison />} />
        <Route path="profit" element={<ProfitAnalysis />} />
        {/* ユーザー管理は admin のみ（RequireAdmin で二重ガード） */}
        <Route path="users" element={<RequireAdmin><UserManagement /></RequireAdmin>} />
      </Route>
    </Routes>
  );
}

/**
 * アプリケーションのルートコンポーネント。
 * BrowserRouter → AuthProvider → AppRoutes の順でプロバイダーを配置する。
 * QueryClientProvider と Toaster は main.tsx でラップしている。
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
