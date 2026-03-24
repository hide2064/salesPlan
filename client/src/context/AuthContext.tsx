import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api/client';
import { login as apiLogin, fetchMe } from '../api/auth';
import type { User } from '../api/auth';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  can: (action: 'write' | 'admin') => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'sales_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchMe()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem(TOKEN_KEY);
          delete api.defaults.headers.common['Authorization'];
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (username: string, password: string) => {
    const res = await apiLogin(username, password);
    localStorage.setItem(TOKEN_KEY, res.token);
    api.defaults.headers.common['Authorization'] = `Bearer ${res.token}`;
    setUser(res.user as User);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
  };

  /**
   * 操作権限チェック
   * - 'write': manager以上 (viewer は閲覧のみ)
   * - 'admin': admin のみ
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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
