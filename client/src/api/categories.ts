import api from './client';
import type { Category } from '../types';

export const fetchCategories = () =>
  api.get<Category[]>('/categories').then((r) => r.data);

export const createCategory = (data: { name: string; sort_order?: number }) =>
  api.post<Category>('/categories', data).then((r) => r.data);

export const updateCategory = (id: number, data: Partial<Category>) =>
  api.put<Category>(`/categories/${id}`, data).then((r) => r.data);

export const deleteCategory = (id: number) =>
  api.delete(`/categories/${id}`);
