/**
 * @file SalesEntry.tsx
 * @description 売上入力ページ
 *
 * ## 機能
 * - 売上の新規登録フォーム（react-hook-form + zod バリデーション）
 * - カテゴリ選択 → 製品一覧の動的絞り込み
 * - 製品選択 → デフォルト単価の自動セット
 * - 数量・単価 → 売上金額・原価合計の自動計算
 * - 利益額・利益率のリアルタイムプレビュー
 * - 当月直近10件の表示（登録後に自動更新）
 *
 * ## 自動計算ロジック
 * - amount = quantity * unit_price
 * - cost_amount = quantity * cost_price
 * - profit_amount = amount - cost_amount（クライアント側でプレビュー計算）
 * - 実際のDBへの profit 保存はサーバー側（保存しない）
 *
 * ## キャッシュ無効化
 * 登録成功後に ['sales'] と ['monthly-summary'] のキャッシュを無効化し、
 * 他の画面（ダッシュボード等）のデータを自動更新する。
 */

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { fetchCategories } from '../api/categories';
import { fetchProducts } from '../api/products';
import { createSale, fetchSales } from '../api/sales';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { formatCurrency, formatPercent, formatDate, currentYearMonth } from '../utils/formatters';

/**
 * フォームのバリデーションスキーマ（zod）。
 * coerce.number() で input の文字列値を数値に強制変換する。
 */
const schema = z.object({
  sale_date: z.string().min(1, '日付は必須'),
  category_id: z.coerce.number().min(1, 'カテゴリは必須'),
  product_id: z.coerce.number().optional().nullable(),
  quantity: z.coerce.number().min(0, '0以上'),
  unit_price: z.coerce.number().min(0, '0以上'),
  cost_price: z.coerce.number().min(0).optional().nullable(),
  amount: z.coerce.number().min(0, '0以上'),
  cost_amount: z.coerce.number().min(0).optional().nullable(),
  customer_name: z.string().max(200).optional(),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

/**
 * 売上入力ページコンポーネント。
 * manager以上のロールのみアクセス可能（App.tsx の writeOnly 設定で制御）。
 */
export default function SalesEntry() {
  const qc = useQueryClient();
  const today = new Date().toISOString().substring(0, 10);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { sale_date: today, quantity: 1, unit_price: 0, amount: 0 },
  });

  // カテゴリ一覧（アクティブのみ）
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });

  // カテゴリ選択が変わったら対応する製品一覧を再取得
  const categoryId = watch('category_id');
  const { data: products } = useQuery({
    queryKey: ['products', categoryId],
    queryFn: () => fetchProducts({ category_id: categoryId }),
    enabled: !!categoryId, // カテゴリ未選択時はフェッチしない
  });

  /**
   * 製品選択時のデフォルト価格自動セット。
   * 製品マスタの default_unit_price / default_cost_price をフォームにセットする。
   * ユーザーが手動で変更した場合は上書きしないよう、製品変更時のみ実行する。
   */
  const productId = watch('product_id');
  useEffect(() => {
    if (!productId || !products) return;
    const p = products.find((x) => x.id === Number(productId));
    if (!p) return;
    if (p.default_unit_price) setValue('unit_price', p.default_unit_price);
    if (p.default_cost_price) setValue('cost_price', p.default_cost_price);
  }, [productId, products, setValue]);

  /**
   * 数量・単価変更時の金額自動計算。
   * Math.round(...* 100) / 100 で小数点2桁に丸める（浮動小数点誤差対策）。
   */
  const quantity = watch('quantity');
  const unitPrice = watch('unit_price');
  const costPrice = watch('cost_price');
  useEffect(() => {
    if (quantity >= 0 && unitPrice >= 0) setValue('amount', Math.round(quantity * unitPrice * 100) / 100);
    if (quantity >= 0 && (costPrice ?? 0) >= 0) setValue('cost_amount', Math.round(quantity * (costPrice ?? 0) * 100) / 100);
  }, [quantity, unitPrice, costPrice, setValue]);

  // 利益プレビュー（フォーム入力値からリアルタイム計算、DBには保存しない）
  const amount = watch('amount');
  const costAmount = watch('cost_amount') ?? 0;
  const profitAmount = (amount ?? 0) - costAmount;
  const profitRate = amount > 0 ? (profitAmount / amount) * 100 : null;

  // 当月直近10件の売上一覧（登録確認用）
  const { data: recentSales } = useQuery({
    queryKey: ['sales', { year_month: currentYearMonth(), limit: 10 }],
    queryFn: () => fetchSales({ year_month: currentYearMonth(), limit: 10 }),
  });

  const mutation = useMutation({
    mutationFn: createSale,
    onSuccess: () => {
      toast.success('売上を登録しました');
      // フォームをリセット（日付は今日、数量は1に戻す）
      reset({ sale_date: today, quantity: 1, unit_price: 0, amount: 0 });
      // 売上一覧・月次サマリのキャッシュを無効化して他の画面を更新
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['monthly-summary'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">売上入力</h1>

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="bg-white rounded-lg shadow-sm p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">日付 *</label>
            <input type="date" {...register('sale_date')} className="w-full border rounded px-3 py-2 text-sm" />
            {errors.sale_date && <p className="text-red-500 text-xs mt-1">{errors.sale_date.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ *</label>
            <select {...register('category_id')} className="w-full border rounded px-3 py-2 text-sm">
              <option value="">選択してください</option>
              {categories?.filter((c) => c.is_active).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {errors.category_id && <p className="text-red-500 text-xs mt-1">{errors.category_id.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">製品</label>
            <select {...register('product_id')} className="w-full border rounded px-3 py-2 text-sm">
              <option value="">製品なし</option>
              {products?.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">顧客名</label>
            <input type="text" {...register('customer_name')} className="w-full border rounded px-3 py-2 text-sm" placeholder="顧客・取引先名" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">数量 *</label>
            <input type="number" step="any" {...register('quantity')} className="w-full border rounded px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">販売単価 *</label>
            <input type="number" step="any" {...register('unit_price')} className="w-full border rounded px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">原価単価</label>
            <input type="number" step="any" {...register('cost_price')} className="w-full border rounded px-3 py-2 text-sm" placeholder="原価（任意）" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">売上金額 *</label>
            <input type="number" step="any" {...register('amount')} className="w-full border rounded px-3 py-2 text-sm" />
            {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">原価合計</label>
            <input type="number" step="any" {...register('cost_amount')} className="w-full border rounded px-3 py-2 text-sm" />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
            <input type="text" {...register('description')} className="w-full border rounded px-3 py-2 text-sm" />
          </div>
        </div>

        {/* 利益プレビュー: 登録前に利益額・利益率を確認できる（DBには保存しない計算値） */}
        <div className="bg-gray-50 rounded p-3 flex gap-6 text-sm">
          <span>利益額: <strong className={profitAmount >= 0 ? 'text-green-600' : 'text-red-600'}>{formatCurrency(profitAmount)}</strong></span>
          <span>利益率: <strong className={profitAmount >= 0 ? 'text-green-600' : 'text-red-600'}>{formatPercent(profitRate)}</strong></span>
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="bg-blue-600 text-white px-6 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? '登録中...' : '登録する'}
        </button>
      </form>

      {/* 直近入力一覧: 登録直後の確認・誤入力の把握に使用 */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">当月 直近10件</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-600">
                <th className="text-left p-2">日付</th>
                <th className="text-left p-2">製品</th>
                <th className="text-left p-2">顧客</th>
                <th className="text-right p-2">売上</th>
                <th className="text-right p-2">利益</th>
                <th className="text-right p-2">利益率</th>
              </tr>
            </thead>
            <tbody>
              {recentSales?.data.map((s) => (
                <tr key={s.id} className="border-t hover:bg-gray-50">
                  <td className="p-2">{formatDate(s.sale_date)}</td>
                  {/* 製品名がない場合はカテゴリ名で代替表示 */}
                  <td className="p-2">{s.product_name ?? s.category_name}</td>
                  <td className="p-2">{s.customer_name ?? '-'}</td>
                  <td className="p-2 text-right">{formatCurrency(s.amount)}</td>
                  <td className="p-2 text-right">{formatCurrency(s.profit_amount)}</td>
                  <td className="p-2 text-right">{formatPercent(s.profit_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
