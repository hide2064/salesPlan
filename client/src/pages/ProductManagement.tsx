import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { fetchCategories, createCategory } from '../api/categories';
import { fetchProducts, createProduct, fetchProductPrices, addProductPrice } from '../api/products';
import { formatCurrency, formatDate } from '../utils/formatters';
import type { Product } from '../types';

export default function ProductManagement() {
  const qc = useQueryClient();
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [tab, setTab] = useState<'info' | 'prices'>('info');

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  const { data: products } = useQuery({
    queryKey: ['products', selectedCategoryId],
    queryFn: () => fetchProducts({ category_id: selectedCategoryId ?? undefined, include_inactive: true }),
  });
  const { data: priceHistory } = useQuery({
    queryKey: ['product-prices', selectedProduct?.id],
    queryFn: () => fetchProductPrices(selectedProduct!.id),
    enabled: !!selectedProduct && tab === 'prices',
  });

  // カテゴリ追加フォーム
  const catForm = useForm<{ name: string }>({ defaultValues: { name: '' } });
  const catMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => { toast.success('カテゴリを追加しました'); catForm.reset(); qc.invalidateQueries({ queryKey: ['categories'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  // 製品追加フォーム
  const prodForm = useForm<{
    name: string; code: string; unit: string;
    default_unit_price: string; default_cost_price: string;
  }>({ defaultValues: { name: '', code: '', unit: '個', default_unit_price: '', default_cost_price: '' } });

  const prodMutation = useMutation({
    mutationFn: (v: any) => createProduct({ ...v, category_id: selectedCategoryId }),
    onSuccess: () => { toast.success('製品を追加しました'); prodForm.reset({ unit: '個' }); qc.invalidateQueries({ queryKey: ['products'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  // 価格改定フォーム
  const priceForm = useForm<{
    valid_from: string; unit_price: string; cost_price: string; reason: string;
  }>({ defaultValues: { valid_from: new Date().toISOString().substring(0, 10), unit_price: '', cost_price: '', reason: '' } });

  const priceMutation = useMutation({
    mutationFn: (v: any) => addProductPrice(selectedProduct!.id, v),
    onSuccess: () => {
      toast.success('価格改定を記録しました');
      priceForm.reset({ valid_from: new Date().toISOString().substring(0, 10) });
      qc.invalidateQueries({ queryKey: ['product-prices', selectedProduct?.id] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800">製品管理</h1>

      <div className="grid grid-cols-3 gap-4">
        {/* カテゴリ一覧 */}
        <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">カテゴリ</h2>
          <ul className="space-y-1">
            {categories?.filter((c) => c.is_active).map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => { setSelectedCategoryId(c.id); setSelectedProduct(null); }}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${
                    selectedCategoryId === c.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50'
                  }`}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={catForm.handleSubmit((v) => catMutation.mutate(v))} className="flex gap-2 pt-2 border-t">
            <input {...catForm.register('name', { required: true })} placeholder="新規カテゴリ名"
              className="flex-1 border rounded px-2 py-1 text-xs" />
            <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded text-xs">追加</button>
          </form>
        </div>

        {/* 製品一覧 */}
        <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">製品</h2>
          {!selectedCategoryId ? (
            <p className="text-xs text-gray-400">カテゴリを選択してください</p>
          ) : (
            <>
              <ul className="space-y-1">
                {products?.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => { setSelectedProduct(p); setTab('info'); }}
                      className={`w-full text-left px-3 py-2 rounded text-sm ${
                        selectedProduct?.id === p.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50'
                      } ${!p.is_active ? 'opacity-40' : ''}`}
                    >
                      <div>{p.name}</div>
                      {p.code && <div className="text-xs text-gray-400">{p.code}</div>}
                    </button>
                  </li>
                ))}
              </ul>
              <form onSubmit={prodForm.handleSubmit((v) => prodMutation.mutate(v))} className="space-y-2 pt-2 border-t">
                <input {...prodForm.register('name', { required: true })} placeholder="製品名 *"
                  className="w-full border rounded px-2 py-1 text-xs" />
                <div className="flex gap-2">
                  <input {...prodForm.register('code')} placeholder="コード"
                    className="flex-1 border rounded px-2 py-1 text-xs" />
                  <input {...prodForm.register('unit')} placeholder="単位"
                    className="w-16 border rounded px-2 py-1 text-xs" />
                </div>
                <div className="flex gap-2">
                  <input type="number" step="any" {...prodForm.register('default_unit_price')} placeholder="標準単価"
                    className="flex-1 border rounded px-2 py-1 text-xs" />
                  <input type="number" step="any" {...prodForm.register('default_cost_price')} placeholder="標準原価"
                    className="flex-1 border rounded px-2 py-1 text-xs" />
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white py-1 rounded text-xs">製品追加</button>
              </form>
            </>
          )}
        </div>

        {/* 製品詳細 */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          {!selectedProduct ? (
            <p className="text-xs text-gray-400">製品を選択してください</p>
          ) : (
            <>
              <div className="flex gap-2 border-b mb-3">
                {(['info', 'prices'] as const).map((t) => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`pb-2 text-sm px-2 ${tab === t ? 'border-b-2 border-blue-600 text-blue-600 font-medium' : 'text-gray-500'}`}>
                    {t === 'info' ? '基本情報' : '価格改定履歴'}
                  </button>
                ))}
              </div>

              {tab === 'info' && (
                <div className="space-y-2 text-sm">
                  <div><span className="text-gray-500">製品名:</span> <strong>{selectedProduct.name}</strong></div>
                  <div><span className="text-gray-500">コード:</span> {selectedProduct.code ?? '-'}</div>
                  <div><span className="text-gray-500">単位:</span> {selectedProduct.unit}</div>
                  <div><span className="text-gray-500">標準販売単価:</span> {formatCurrency(selectedProduct.default_unit_price)}</div>
                  <div><span className="text-gray-500">標準原価:</span> {formatCurrency(selectedProduct.default_cost_price)}</div>
                  {selectedProduct.default_unit_price && selectedProduct.default_cost_price && (
                    <div className="bg-gray-50 rounded p-2 text-xs">
                      標準利益率: {(((selectedProduct.default_unit_price - selectedProduct.default_cost_price) / selectedProduct.default_unit_price) * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
              )}

              {tab === 'prices' && (
                <div className="space-y-3">
                  <form onSubmit={priceForm.handleSubmit((v) => priceMutation.mutate(v))} className="space-y-2 border rounded p-3">
                    <p className="text-xs font-medium text-gray-700">価格改定を記録</p>
                    <input type="date" {...priceForm.register('valid_from', { required: true })}
                      className="w-full border rounded px-2 py-1 text-xs" />
                    <div className="flex gap-2">
                      <input type="number" step="any" {...priceForm.register('unit_price')} placeholder="新販売単価"
                        className="flex-1 border rounded px-2 py-1 text-xs" />
                      <input type="number" step="any" {...priceForm.register('cost_price')} placeholder="新原価"
                        className="flex-1 border rounded px-2 py-1 text-xs" />
                    </div>
                    <input {...priceForm.register('reason')} placeholder="改定理由"
                      className="w-full border rounded px-2 py-1 text-xs" />
                    <button type="submit" className="w-full bg-blue-600 text-white py-1 rounded text-xs">記録</button>
                  </form>

                  <ul className="space-y-2">
                    {priceHistory?.map((h) => (
                      <li key={h.id} className="text-xs border rounded p-2 space-y-1">
                        <div className="font-medium">{formatDate(h.valid_from)} 適用</div>
                        <div className="flex gap-4 text-gray-600">
                          <span>単価: {formatCurrency(h.unit_price)}</span>
                          <span>原価: {formatCurrency(h.cost_price)}</span>
                        </div>
                        {h.reason && <div className="text-gray-400">{h.reason}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
