/**
 * @file salePlans.ts
 * @description 売上予定案件 API コール関数
 */

import api from './client';
import type { SalePlan, SalePlanListResponse } from '../types';

export interface SalePlanFilters {
  year_month?: string;
  status?: 'pending' | 'converted';
  page?: number;
  limit?: number;
}

export const fetchSalePlans = (filters: SalePlanFilters = {}) =>
  api.get<SalePlanListResponse>('/sale-plans', { params: filters }).then((r) => r.data);

export const createSalePlan = (data: Partial<SalePlan>) =>
  api.post<SalePlan>('/sale-plans', data).then((r) => r.data);

export const updateSalePlan = (id: number, data: Partial<SalePlan>) =>
  api.put<SalePlan>(`/sale-plans/${id}`, data).then((r) => r.data);

export const deleteSalePlan = (id: number) =>
  api.delete(`/sale-plans/${id}`);

/** 売上予定を売上実績へ転換する。作成された sales レコードを返す。 */
export const convertSalePlan = (id: number) =>
  api.post<{ sale: any; sale_plan_id: number }>(`/sale-plans/${id}/convert`).then((r) => r.data);
