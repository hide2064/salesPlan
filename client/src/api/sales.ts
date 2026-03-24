import api from './client';
import type { Sale, SaleListResponse } from '../types';

export interface SaleFilters {
  year_month?: string;
  category_id?: number;
  product_id?: number;
  customer_name?: string;
  page?: number;
  limit?: number;
}

export const fetchSales = (filters: SaleFilters = {}) =>
  api.get<SaleListResponse>('/sales', { params: filters }).then((r) => r.data);

export const createSale = (data: Partial<Sale>) =>
  api.post<Sale>('/sales', data).then((r) => r.data);

export const updateSale = (id: number, data: Partial<Sale>) =>
  api.put<Sale>(`/sales/${id}`, data).then((r) => r.data);

export const deleteSale = (id: number) =>
  api.delete(`/sales/${id}`);
