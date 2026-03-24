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

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner text="認証確認中..." />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can('admin')) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner text="起動中..." />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="sales/entry" element={<SalesEntry />} />
        <Route path="sales/list" element={<SalesList />} />
        <Route path="products" element={<ProductManagement />} />
        <Route path="forecasts" element={<ForecastManagement />} />
        <Route path="comparison" element={<Comparison />} />
        <Route path="profit" element={<ProfitAnalysis />} />
        <Route path="users" element={<RequireAdmin><UserManagement /></RequireAdmin>} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
