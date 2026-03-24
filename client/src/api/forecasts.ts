import api from './client';
import type { Forecast } from '../types';

export const fetchForecasts = (params?: { year_month?: string; from?: string; to?: string }) =>
  api.get<Forecast[]>('/forecasts', { params }).then((r) => r.data);

export const upsertForecast = (data: Partial<Forecast>) =>
  api.post<Forecast>('/forecasts', data).then((r) => r.data);

export const updateForecast = (id: number, data: Partial<Forecast>) =>
  api.put<Forecast>(`/forecasts/${id}`, data).then((r) => r.data);

export const deleteForecast = (id: number) =>
  api.delete(`/forecasts/${id}`);
