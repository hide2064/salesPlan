import api from './client';
import type { Product, ProductPriceHistory } from '../types';

export const fetchProducts = (params?: { category_id?: number; include_inactive?: boolean }) =>
  api.get<Product[]>('/products', { params }).then((r) => r.data);

export const fetchProduct = (id: number) =>
  api.get<Product>(`/products/${id}`).then((r) => r.data);

export const createProduct = (data: Partial<Product>) =>
  api.post<Product>('/products', data).then((r) => r.data);

export const updateProduct = (id: number, data: Partial<Product>) =>
  api.put<Product>(`/products/${id}`, data).then((r) => r.data);

export const deleteProduct = (id: number) =>
  api.delete(`/products/${id}`);

export const fetchProductPrices = (id: number) =>
  api.get<ProductPriceHistory[]>(`/products/${id}/prices`).then((r) => r.data);

export const addProductPrice = (
  id: number,
  data: { valid_from: string; cost_price?: number; unit_price?: number; reason?: string }
) => api.post<ProductPriceHistory>(`/products/${id}/prices`, data).then((r) => r.data);
