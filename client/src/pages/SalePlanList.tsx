/**
 * @file SalePlanList.tsx
 * @description 売上予定入力・一覧ページ
 *
 * ## 機能
 * - 売上予定案件の新規登録フォーム
 * - 登録済み予定一覧（年月・ステータスフィルタ）
 * - 「変更」ボタン: モーダルで内容を編集。「売上として確定」にチェックすると
 *   sales テーブルに登録（転換）し、売上一覧に反映される
 * - 「削除」ボタン: pending 状態のみ削除可
 *
 * ## 売上一覧との連携
 * 「売上として確定」で転換すると sales テーブルに INSERT されるため、
 * 売上一覧ページで自動的に表示される。
 */

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { fetchCategories } from '../api/categories';
import { fetchProducts } from '../api/products';
import {
  fetchSalePlans, createSalePlan, updateSalePlan,
  deleteSalePlan, convertSalePlan,
} from '../api/salePlans';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { formatCurrency, formatDate, currentYearMonth } from '../utils/formatters';
import type { SalePlan } from '../types';

const schema = z.object({
  plan_date:     z.string().min(1, '日付は必須'),
  category_id:   z.coerce.number().min(1, 'カテゴリは必須'),
  product_id:    z.coerce.number().optional().nullable(),
  quantity:      z.coerce.number().min(0, '0以上'),
  unit_price:    z.coerce.number().min(0, '0以上'),
  cost_price:    z.coerce.number().min(0).optional().nullable(),
  amount:        z.coerce.number().min(0, '0以上'),
  cost_amount:   z.coerce.number().min(0).optional().nullable(),
  customer_name: z.string().max(200).optional(),
  department:    z.string().max(100).optional(),
  section:       z.string().max(100).optional(),
  description:   z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

// ─── 入力フォーム（新規登録・編集モーダル共用） ─────────────────────
interface PlanFormProps {
  defaultValues: Partial<FormValues>;
  categories: any[];
  submitLabel: string;
  isPending: boolean;
  /** 売上として確定チェックボックスを表示するか（編集モーダルのみ true） */
  showConvertOption?: boolean;
  onSubmit: (values: FormValues, convertOnSave: boolean) => void;
  onCancel?: () => void;
}

function PlanForm({
  defaultValues, categories, submitLabel, isPending,
  showConvertOption = false, onSubmit, onCancel,
}: PlanFormProps) {
  const [convertOnSave, setConvertOnSave] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const categoryId = watch('category_id');
  const { data: products } = useQuery({
    queryKey: ['products', categoryId],
    queryFn: () => fetchProducts({ category_id: categoryId }),
    enabled: !!categoryId,
  });

  const productId = watch('product_id');
  useEffect(() => {
    if (!productId || !products) return;
    const p = products.find((x: any) => x.id === Number(productId));
    if (!p) return;
    if (p.default_unit_price) setValue('unit_price', p.default_unit_price);
    if (p.default_cost_price) setValue('cost_price', p.default_cost_price);
  }, [productId, products, setValue]);

  const quantity  = watch('quantity');
  const unitPrice = watch('unit_price');
  const costPrice = watch('cost_price');
  useEffect(() => {
    if (quantity >= 0 && unitPrice >= 0)
      setValue('amount', Math.round(quantity * unitPrice * 100) / 100);
    if (quantity >= 0 && (costPrice ?? 0) >= 0)
      setValue('cost_amount', Math.round(quantity * (costPrice ?? 0) * 100) / 100);
  }, [quantity, unitPrice, costPrice, setValue]);

  const amount     = watch('amount');
  const costAmount = watch('cost_amount') ?? 0;
  const profit     = (amount ?? 0) - costAmount;

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(v, convertOnSave))} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">予定日 *</label>
          <input type="date" {...register('plan_date')} className="w-full border rounded px-3 py-2 text-sm" />
          {errors.plan_date && <p className="text-red-500 text-xs mt-1">{errors.plan_date.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ *</label>
          <select {...register('category_id')} className="w-full border rounded px-3 py-2 text-sm">
            <option value="">選択してください</option>
            {categories?.filter((c: any) => c.is_active).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {errors.category_id && <p className="text-red-500 text-xs mt-1">{errors.category_id.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">製品</label>
          <select {...register('product_id')} className="w-full border rounded px-3 py-2 text-sm">
            <option value="">製品なし</option>
            {products?.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">顧客名</label>
          <input type="text" {...register('customer_name')} className="w-full border rounded px-3 py-2 text-sm" placeholder="顧客・取引先名" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">部署</label>
          <input type="text" {...register('department')} className="w-full border rounded px-3 py-2 text-sm" placeholder="任意" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">課</label>
          <input type="text" {...register('section')} className="w-full border rounded px-3 py-2 text-sm" placeholder="任意" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">数量 *</label>
          <input type="number" step="any" {...register('quantity')} className="w-full border rounded px-3 py-2 text-sm" />
          {errors.quantity && <p className="text-red-500 text-xs mt-1">{errors.quantity.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">販売単価 *</label>
          <input type="number" step="any" {...register('unit_price')} className="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">原価単価</label>
          <input type="number" step="any" {...register('cost_price')} className="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">売上金額 *</label>
          <input type="number" step="any" {...register('amount')} className="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">原価合計</label>
          <input type="number" step="any" {...register('cost_amount')} className="w-full border rounded px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
          <input type="text" {...register('description')} className="w-full border rounded px-3 py-2 text-sm" placeholder="案件メモ等" />
        </div>
      </div>

      {/* 利益プレビュー */}
      <div className="flex items-center gap-6 bg-gray-50 rounded p-3 text-sm">
        <span className="text-gray-500">予定利益:</span>
        <span className={`font-semibold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {formatCurrency(profit)}
        </span>
      </div>

      {/* 売上確定オプション（編集モーダルのみ表示） */}
      {showConvertOption && (
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={convertOnSave}
            onChange={(e) => setConvertOnSave(e.target.checked)}
            className="w-4 h-4 accent-blue-600"
          />
          <span className="text-sm font-medium text-blue-700">
            実際に売上として確定する（売上一覧に反映されます）
          </span>
        </label>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className={`px-6 py-2 rounded text-sm text-white disabled:opacity-50 ${
            convertOnSave ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isPending ? '処理中...' : convertOnSave ? '売上として確定' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-4 py-2 rounded text-sm border text-gray-600 hover:bg-gray-50">
            キャンセル
          </button>
        )}
      </div>
    </form>
  );
}

// ─── メインページ ─────────────────────────────────────────────────────
export default function SalePlanList() {
  const qc = useQueryClient();
  const today = new Date().toISOString().substring(0, 10);

  // フィルタ
  const [yearMonth, setYearMonth]       = useState(currentYearMonth());
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'converted'>('all');
  const [page, setPage]                 = useState(1);
  const limit = 50;

  // 編集モーダル
  const [editingPlan, setEditingPlan] = useState<SalePlan | null>(null);

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });

  const { data, isLoading } = useQuery({
    queryKey: ['sale-plans', { yearMonth, statusFilter, page }],
    queryFn: () => fetchSalePlans({
      year_month: yearMonth || undefined,
      status:     statusFilter === 'all' ? undefined : statusFilter,
      page,
      limit,
    }),
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['sale-plans'] });
    qc.invalidateQueries({ queryKey: ['sales'] });
    qc.invalidateQueries({ queryKey: ['monthly-summary'] });
  };

  const createMutation = useMutation({
    mutationFn: createSalePlan,
    onSuccess: () => { toast.success('売上予定を登録しました'); qc.invalidateQueries({ queryKey: ['sale-plans'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SalePlan> }) => updateSalePlan(id, data),
    onSuccess: () => { toast.success('変更しました'); setEditingPlan(null); qc.invalidateQueries({ queryKey: ['sale-plans'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const convertMutation = useMutation({
    mutationFn: convertSalePlan,
    onSuccess: () => { toast.success('売上として登録しました。売上一覧で確認できます。'); setEditingPlan(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSalePlan,
    onSuccess: () => { toast.success('削除しました'); qc.invalidateQueries({ queryKey: ['sale-plans'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleCreateSubmit = (values: FormValues) => {
    createMutation.mutate(values);
  };

  const handleEditSubmit = (values: FormValues, convertOnSave: boolean) => {
    if (!editingPlan) return;
    if (convertOnSave) {
      // まず内容を更新してから転換
      updateSalePlan(editingPlan.id, values).then(() => {
        convertMutation.mutate(editingPlan.id);
      }).catch((e: Error) => toast.error(e.message));
    } else {
      updateMutation.mutate({ id: editingPlan.id, data: values });
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">売上予定</h1>

      {/* ── 新規登録フォーム ───────────────────────────────── */}
      <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 border-b pb-2">新規予定登録</h2>
        {categories && (
          <PlanForm
            defaultValues={{ plan_date: today, quantity: 1, unit_price: 0, amount: 0 }}
            categories={categories}
            submitLabel="予定を登録"
            isPending={createMutation.isPending}
            showConvertOption={false}
            onSubmit={handleCreateSubmit}
          />
        )}
      </div>

      {/* ── 一覧 ──────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">年月</label>
            <input type="month" value={yearMonth}
              onChange={(e) => { setYearMonth(e.target.value); setPage(1); }}
              className="border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">ステータス</label>
            <select value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
              className="border rounded px-2 py-1 text-sm">
              <option value="all">全て</option>
              <option value="pending">予定中</option>
              <option value="converted">売上確定済み</option>
            </select>
          </div>
        </div>

        {isLoading ? <LoadingSpinner /> : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="px-4 py-2 text-xs text-gray-500 border-b">
              全 {data?.total ?? 0} 件 (ページ {page}/{totalPages || 1})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-xs">
                    <th className="text-left p-2">予定日</th>
                    <th className="text-left p-2">カテゴリ</th>
                    <th className="text-left p-2">製品</th>
                    <th className="text-left p-2">顧客名</th>
                    <th className="text-right p-2">数量</th>
                    <th className="text-right p-2">売上金額</th>
                    <th className="text-right p-2">原価合計</th>
                    <th className="text-center p-2">状態</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data?.data.length === 0 && (
                    <tr><td colSpan={9} className="text-center py-8 text-gray-400">データがありません</td></tr>
                  )}
                  {data?.data.map((plan) => (
                    <tr key={plan.id} className="border-t hover:bg-gray-50">
                      <td className="p-2">{formatDate(plan.plan_date)}</td>
                      <td className="p-2">{plan.category_name}</td>
                      <td className="p-2">{plan.product_name ?? '-'}</td>
                      <td className="p-2">{plan.customer_name ?? '-'}</td>
                      <td className="p-2 text-right">{plan.quantity}</td>
                      <td className="p-2 text-right font-medium">{formatCurrency(plan.amount)}</td>
                      <td className="p-2 text-right text-gray-500">
                        {plan.cost_amount != null ? formatCurrency(plan.cost_amount) : '-'}
                      </td>
                      <td className="p-2 text-center">
                        {plan.status === 'converted' ? (
                          <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs">売上確定済み</span>
                        ) : (
                          <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-xs">予定中</span>
                        )}
                      </td>
                      <td className="p-2">
                        {plan.status === 'pending' && (
                          <div className="flex gap-2 items-center">
                            <button
                              onClick={() => {
                                if (confirm(`「${plan.customer_name ?? plan.category_name}」を売上実績として確定しますか？`))
                                  convertMutation.mutate(plan.id);
                              }}
                              disabled={convertMutation.isPending}
                              className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700 disabled:opacity-50"
                            >
                              売上確定
                            </button>
                            <button
                              onClick={() => setEditingPlan(plan)}
                              className="bg-gray-100 text-gray-700 border border-gray-300 px-2 py-1 rounded text-xs hover:bg-gray-200"
                            >
                              変更
                            </button>
                            <button
                              onClick={() => { if (confirm('削除しますか？')) deleteMutation.mutate(plan.id); }}
                              className="text-red-500 hover:text-red-700 text-xs"
                            >
                              削除
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center gap-2 p-3 border-t">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-40">前へ</button>
                <span className="px-3 py-1 text-sm">{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-40">次へ</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 編集モーダル ──────────────────────────────────── */}
      {editingPlan && categories && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setEditingPlan(null); }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-base font-semibold text-gray-800">予定の変更</h2>
              <button onClick={() => setEditingPlan(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="p-6">
              <PlanForm
                defaultValues={{
                  plan_date:     editingPlan.plan_date,
                  category_id:   editingPlan.category_id,
                  product_id:    editingPlan.product_id ?? undefined,
                  quantity:      editingPlan.quantity,
                  unit_price:    editingPlan.unit_price,
                  cost_price:    editingPlan.cost_price ?? undefined,
                  amount:        editingPlan.amount,
                  cost_amount:   editingPlan.cost_amount ?? undefined,
                  customer_name: editingPlan.customer_name ?? '',
                  department:    editingPlan.department ?? '',
                  section:       editingPlan.section ?? '',
                  description:   editingPlan.description ?? '',
                }}
                categories={categories}
                submitLabel="変更を保存"
                isPending={updateMutation.isPending || convertMutation.isPending}
                showConvertOption={true}
                onSubmit={handleEditSubmit}
                onCancel={() => setEditingPlan(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
