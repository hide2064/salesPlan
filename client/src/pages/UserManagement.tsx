/**
 * @file UserManagement.tsx
 * @description ユーザー管理ページ（admin専用）
 *
 * ## アクセス制御
 * App.tsx の RequireAdmin で admin ロール以外はアクセス不可。
 * Sidebar でも adminOnly 設定でメニューが非表示になる。
 *
 * ## 機能
 * - ロール説明の表示（各ロールの権限概要）
 * - ユーザー一覧の表示（自分のアカウントをハイライト）
 * - 新規ユーザー追加フォーム
 *
 * ## 未実装の機能
 * - ユーザー情報の編集（ロール変更・パスワードリセット・有効/無効切り替え）
 *   → API (PUT /api/users/:id) は実装済みだが、UIは未実装
 *   → 必要な場合は updateUser() を useMutation で呼ぶ形で追加可能
 *
 * ## ロール権限の設計
 * | ロール   | 説明                                          |
 * |---------|----------------------------------------------|
 * | admin   | 全機能 + ユーザー管理                          |
 * | manager | 売上入力・編集・製品管理・予定管理・CSV取込       |
 * | viewer  | 全画面の閲覧のみ（登録・編集・削除不可）          |
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { fetchUsers, createUser } from '../api/auth';
import { useAuth } from '../context/AuthContext';

/** ロールコード → 日本語ラベルマップ */
const ROLE_LABEL: Record<string, string> = {
  admin: '管理者',
  manager: '担当者',
  viewer: '閲覧者',
};

/** ロールコード → 権限説明マップ（画面上部の説明欄に表示） */
const ROLE_DESC: Record<string, string> = {
  admin: '全機能 + ユーザー管理',
  manager: '売上入力・編集・製品管理・予定管理・CSV取込',
  viewer: '全画面の閲覧のみ（登録・編集・削除不可）',
};

/**
 * ユーザー管理ページコンポーネント。
 * admin ロールのみアクセス可能（App.tsx の RequireAdmin で制御）。
 */
export default function UserManagement() {
  const { user: me } = useAuth(); // 自分自身の情報（一覧でハイライト表示に使用）
  const qc = useQueryClient();

  const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<{
    username: string; password: string; role: string; display_name: string;
  }>({ defaultValues: { role: 'viewer' } }); // デフォルトは最低権限の viewer

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      toast.success('ユーザーを追加しました');
      reset({ role: 'viewer' }); // フォームリセット（roleのデフォルト値を維持）
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">ユーザー管理</h1>

      {/* ロール権限説明: 新規ユーザー作成前に権限の違いを確認できる */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-blue-800 mb-2">ロール権限一覧</h2>
        <div className="space-y-1">
          {Object.entries(ROLE_DESC).map(([role, desc]) => (
            <div key={role} className="flex gap-3 text-sm">
              {/* ロール名: admin=赤、manager=青、viewer=グレー */}
              <span className={`font-medium w-16 ${
                role === 'admin' ? 'text-red-700' : role === 'manager' ? 'text-blue-700' : 'text-gray-600'
              }`}>{ROLE_LABEL[role]}</span>
              <span className="text-gray-600">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ユーザー一覧 */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-xs">
              <th className="text-left p-3">ユーザー名</th>
              <th className="text-left p-3">表示名</th>
              <th className="text-left p-3">ロール</th>
              <th className="text-left p-3">状態</th>
              <th className="text-left p-3">作成日</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="p-4 text-center text-gray-400">読み込み中...</td></tr>
            ) : users?.map((u) => (
              // 自分自身の行は黄色背景でハイライト
              <tr key={u.id} className={`border-t hover:bg-gray-50 ${u.id === me?.id ? 'bg-yellow-50' : ''}`}>
                <td className="p-3 font-medium">
                  {u.username}
                  {u.id === me?.id && <span className="ml-2 text-xs text-yellow-600">(あなた)</span>}
                </td>
                <td className="p-3">{u.display_name}</td>
                <td className="p-3">
                  {/* ロールバッジ: admin=赤、manager=青、viewer=グレー */}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.role === 'admin' ? 'bg-red-100 text-red-700' :
                    u.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{ROLE_LABEL[u.role]}</span>
                </td>
                <td className="p-3">
                  <span className={`text-xs ${(u as any).is_active ? 'text-green-600' : 'text-red-500'}`}>
                    {(u as any).is_active ? '有効' : '無効'}
                  </span>
                </td>
                <td className="p-3 text-gray-500">{(u as any).created_at?.substring(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 新規ユーザー追加フォーム */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">新規ユーザー追加</h2>
        <form onSubmit={handleSubmit((v) => createMutation.mutate(v))} className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ユーザー名 *</label>
            <input {...register('username', { required: true, minLength: 3 })}
              className="w-full border rounded px-3 py-2 text-sm" placeholder="英数字3文字以上" />
            {errors.username && <p className="text-red-500 text-xs mt-1">3文字以上で入力してください</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">表示名</label>
            <input {...register('display_name')} className="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">パスワード *</label>
            <input type="password" {...register('password', { required: true, minLength: 6 })}
              className="w-full border rounded px-3 py-2 text-sm" placeholder="6文字以上" />
            {errors.password && <p className="text-red-500 text-xs mt-1">6文字以上で入力してください</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ロール *</label>
            <select {...register('role')} className="w-full border rounded px-3 py-2 text-sm">
              {/* セキュリティ原則: 最低権限から選択させる（デフォルト: 閲覧者） */}
              <option value="viewer">閲覧者</option>
              <option value="manager">担当者</option>
              <option value="admin">管理者</option>
            </select>
          </div>
          <div className="col-span-2">
            <button type="submit" disabled={createMutation.isPending}
              className="bg-blue-600 text-white px-6 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
              {createMutation.isPending ? '追加中...' : 'ユーザーを追加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
