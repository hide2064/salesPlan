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

export default function SalesEntry() {
  const qc = useQueryClient();
  const today = new Date().toISOString().substring(0, 10);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { sale_date: today, quantity: 1, unit_price: 0, amount: 0 },
  });

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  const categoryId = watch('category_id');
  const { data: products } = useQuery({
    queryKey: ['products', categoryId],
    queryFn: () => fetchProducts({ category_id: categoryId }),
    enabled: !!categoryId,
  });

  // 製品選択時にデフォルト価格をセット
  const productId = watch('product_id');
  useEffect(() => {
    if (!productId || !products) return;
    const p = products.find((x) => x.id === Number(productId));
    if (!p) return;
    if (p.default_unit_price) setValue('unit_price', p.default_unit_price);
    if (p.default_cost_price) setValue('cost_price', p.default_cost_price);
  }, [productId, products, setValue]);

  // 数量・単価が変わったら金額を自動計算
  const quantity = watch('quantity');
  const unitPrice = watch('unit_price');
  const costPrice = watch('cost_price');
  useEffect(() => {
    if (quantity >= 0 && unitPrice >= 0) setValue('amount', Math.round(quantity * unitPrice * 100) / 100);
    if (quantity >= 0 && (costPrice ?? 0) >= 0) setValue('cost_amount', Math.round(quantity * (costPrice ?? 0) * 100) / 100);
  }, [quantity, unitPrice, costPrice, setValue]);

  const amount = watch('amount');
  const costAmount = watch('cost_amount') ?? 0;
  const profitAmount = (amount ?? 0) - costAmount;
  const profitRate = amount > 0 ? (profitAmount / amount) * 100 : null;

  const { data: recentSales } = useQuery({
    queryKey: ['sales', { year_month: currentYearMonth(), limit: 10 }],
    queryFn: () => fetchSales({ year_month: currentYearMonth(), limit: 10 }),
  });

  const mutation = useMutation({
    mutationFn: createSale,
    onSuccess: () => {
      toast.success('売上を登録しました');
      reset({ sale_date: today, quantity: 1, unit_price: 0, amount: 0 });
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

        {/* 利益プレビュー */}
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

      {/* 直近入力一覧 */}
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
