import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Sidebar() {
  const { user, logout, can } = useAuth();

  const nav = [
    { to: '/dashboard',   label: 'ダッシュボード', always: true },
    { to: '/sales/entry', label: '売上入力',       writeOnly: true },
    { to: '/sales/list',  label: '売上一覧',       always: true },
    { to: '/products',    label: '製品管理',       always: true },
    { to: '/forecasts',   label: '予定売上管理',   always: true },
    { to: '/comparison',  label: '月別比較',       always: true },
    { to: '/profit',      label: '利益分析',       always: true },
    { to: '/users',       label: 'ユーザー管理',   adminOnly: true },
  ].filter((item) => {
    if (item.adminOnly) return can('admin');
    if (item.writeOnly) return can('write');
    return true;
  });

  const roleLabel: Record<string, string> = { admin: '管理者', manager: '担当者', viewer: '閲覧者' };

  return (
    <aside className="w-48 bg-gray-900 text-white flex flex-col">
      <div className="p-4 text-center font-bold border-b border-gray-700 text-sm leading-tight">
        売上管理<br />システム
      </div>

      <nav className="flex-1 py-2">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `block px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* ユーザー情報 */}
      {user && (
        <div className="p-3 border-t border-gray-700 text-xs">
          <div className="text-gray-300 truncate">{user.display_name}</div>
          <div className="text-gray-500">{roleLabel[user.role] ?? user.role}</div>
          <button onClick={logout}
            className="mt-2 w-full text-left text-gray-400 hover:text-white">
            ログアウト
          </button>
        </div>
      )}
    </aside>
  );
}
