import api from './client';
import type {
  MonthlySummary,
  MonthComparisonRow,
  ActualVsForecastRow,
  ProfitAnalysisRow,
  ProductRankingRow,
} from '../types';

export const fetchMonthlySummary = (params?: { from?: string; to?: string }) =>
  api.get<MonthlySummary[]>('/reports/monthly-summary', { params }).then((r) => r.data);

export const fetchMonthComparison = (month1: string, month2: string) =>
  api
    .get<{ month1: string; month2: string; data: MonthComparisonRow[] }>('/reports/month-comparison', {
      params: { month1, month2 },
    })
    .then((r) => r.data);

export const fetchActualVsForecast = (year_month: string) =>
  api
    .get<{ year_month: string; data: ActualVsForecastRow[] }>('/reports/actual-vs-forecast', {
      params: { year_month },
    })
    .then((r) => r.data);

export const fetchProfitAnalysis = (params?: {
  from?: string;
  to?: string;
  category_id?: number;
  product_id?: number;
}) => api.get<ProfitAnalysisRow[]>('/reports/profit-analysis', { params }).then((r) => r.data);

export const fetchProductRanking = (params?: {
  from?: string;
  to?: string;
  category_id?: number;
  limit?: number;
}) => api.get<ProductRankingRow[]>('/reports/product-ranking', { params }).then((r) => r.data);
