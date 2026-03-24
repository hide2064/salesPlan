export interface Category {
  id: number;
  name: string;
  sort_order: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: number;
  category_id: number;
  category_name: string;
  name: string;
  code: string | null;
  unit: string;
  default_cost_price: number | null;
  default_unit_price: number | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ProductPriceHistory {
  id: number;
  product_id: number;
  valid_from: string;
  cost_price: number | null;
  unit_price: number | null;
  reason: string | null;
  created_at: string;
}

export interface Sale {
  id: number;
  sale_date: string;
  year: number;
  month: number;
  year_month: string;
  category_id: number;
  category_name: string;
  product_id: number | null;
  product_name: string | null;
  product_unit: string | null;
  quantity: number;
  unit_price: number;
  cost_price: number | null;
  amount: number;
  cost_amount: number | null;
  profit_amount: number;
  profit_rate: number | null;
  customer_name: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaleListResponse {
  data: Sale[];
  total: number;
  page: number;
  limit: number;
}

export interface Forecast {
  id: number;
  year_month: string;
  year: number;
  month: number;
  category_id: number;
  category_name: string;
  forecast_amount: number;
  forecast_cost_rate: number | null;
  forecast_profit: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MonthlySummary {
  year_month: string;
  total_amount: number;
  total_cost: number;
  total_profit: number;
  profit_rate: number;
  total_forecast: number;
  total_forecast_profit: number;
  achievement_rate: number | null;
  sales_count: number;
}

export interface MonthComparisonRow {
  category_id: number;
  category_name: string;
  amount1: number;
  cost1: number;
  profit1: number;
  amount2: number;
  cost2: number;
  profit2: number;
  diff_amount: number;
  diff_rate: number | null;
  profit_rate1: number;
  profit_rate2: number;
}

export interface ActualVsForecastRow {
  category_id: number;
  category_name: string;
  actual_amount: number;
  actual_cost: number;
  actual_profit: number;
  forecast_amount: number | null;
  forecast_cost_rate: number | null;
  forecast_profit: number | null;
  achievement_rate: number | null;
}

export interface ProfitAnalysisRow {
  year_month: string;
  category_id: number;
  category_name: string;
  product_id: number | null;
  product_name: string | null;
  sales_count: number;
  total_quantity: number;
  total_amount: number;
  total_cost: number;
  total_profit: number;
  profit_rate: number;
}

export interface ProductRankingRow {
  product_id: number;
  product_name: string;
  unit: string;
  category_id: number;
  category_name: string;
  sales_count: number;
  total_quantity: number;
  total_amount: number;
  total_cost: number;
  total_profit: number;
  profit_rate: number;
}
