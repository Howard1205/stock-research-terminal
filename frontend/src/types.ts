export interface StockSummary {
  symbol: string;
  name: string;
}

export interface SourceInfo {
  name: string;
  dataset: string;
  updated_at: string;
}

export interface StockDetail extends StockSummary {
  price: number | null;
  change_percent: number | null;
  volume: number | null;
  market_cap: number | null;
  pe: number | null;
  pb: number | null;
  circulating_market_cap: number | null;
  turnover_rate: number | null;
  amplitude: number | null;
  volume_ratio: number | null;
  limit_up: number | null;
  limit_down: number | null;
  industry: string | null;
  concepts: string[];
  updated_at: string;
  source: SourceInfo;
}

export interface CompanyProfile {
  symbol: string;
  company_name: string | null;
  exchange: string | null;
  industry: string | null;
  listed_date: string | null;
  main_business: string | null;
  business_scope: string | null;
  main_products: string | null;
  upstream_downstream: string | null;
  upstream_industries: string | null;
  midstream_segment: string | null;
  downstream_customers_applications: string | null;
  website: string | null;
  updated_at: string;
  source: SourceInfo;
}

export interface CompanyReport {
  id: string;
  title: string;
  published_at: string;
  url: string;
  pdf_url: string | null;
  summary_status: "not_generated" | "available" | "unavailable";
  summary: string | null;
  page: number | null;
  section: string | null;
}

export interface CompanyReports {
  symbol: string;
  reports: CompanyReport[];
  updated_at: string;
  source: SourceInfo;
}

export interface IntradayPoint {
  time: string;
  price: number;
  volume: number;
  amount: number | null;
  average_price: number;
}

export interface IntradayData {
  symbol: string;
  date: string;
  available: boolean;
  message: string | null;
  daily: KlineBar | null;
  points: IntradayPoint[];
  average_estimated: boolean;
  updated_at: string;
  source: SourceInfo;
}

export interface KlineBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change_percent: number | null;
  amplitude: number | null;
  turnover_rate: number | null;
  turnover_estimated: boolean;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
  bbi: number | null;
}

export interface FundFlowItem {
  date: string;
  main_net: number | null;
  main_inflow: number | null;
  main_outflow: number | null;
  super_large_net: number | null;
  super_large_inflow: number | null;
  super_large_outflow: number | null;
  large_net: number | null;
  large_inflow: number | null;
  large_outflow: number | null;
  medium_net: number | null;
  medium_inflow: number | null;
  medium_outflow: number | null;
  small_net: number | null;
  small_inflow: number | null;
  small_outflow: number | null;
}

export interface FundFlowData {
  symbol: string;
  items: FundFlowItem[];
  updated_at: string;
  source: SourceInfo;
}

export interface MarketNewsItem {
  id: string;
  title: string;
  summary: string;
  published_at: string;
  source: string;
  url: string;
  markets: string[];
  sectors: string[];
  impact: string;
  importance: string;
}

export interface HotMarketSector {
  name: string;
  type: "行业" | "概念";
  change_percent: number;
  heat: number | null;
  stocks: Array<{
    name: string;
    symbol: string;
    change_percent: number | null;
  }>;
  reason: string;
  source: string;
  source_url: string;
}

export interface MarketNewsData {
  items: MarketNewsItem[];
  hot_sectors: HotMarketSector[];
  daily_summary: {
    top_items: Array<{ title: string; impact: string; url: string }>;
    a_share: string;
    us_share: string;
    technology: string;
    risks: string[];
  };
  warnings: string[];
  updated_at: string;
  source: SourceInfo;
}

export interface ResearchEvidence {
  title: string;
  content: string;
  source_type: string;
  published_at: string;
  url: string;
}

export interface MoveAnalysis {
  symbol: string;
  date: string;
  reliable: boolean;
  summary: string;
  limit_status: string;
  themes: string[];
  catalysts: string[];
  evidence: ResearchEvidence[];
  warnings: string[];
  updated_at: string;
  source: SourceInfo;
}

export interface ReportSummaryItem {
  category: string;
  content: string;
  page: number;
  section: string | null;
  source: {
    title: string;
    published_at: string;
    url: string;
    type: string;
  };
}

export interface ReportSummary {
  status: "available" | "unavailable";
  message: string | null;
  items: ReportSummaryItem[];
  page_count: number;
  local_cache: string;
  updated_at: string;
}

export interface MarketFocusTopic {
  topic: string;
  possible_catalyst: string;
  evidence: ResearchEvidence[];
}

export interface MarketFocus {
  symbol: string;
  traditional_business: string | null;
  topics: MarketFocusTopic[];
  message: string | null;
  warnings: string[];
  updated_at: string;
  source: SourceInfo;
}

export interface EventFeedItem {
  title: string;
  published_at: string;
  source: string;
  event_type: string;
  summary: string;
  impact: "利好" | "利空" | "中性" | "不确定";
  businesses: string[];
  url: string;
  priority: number;
  relevance_score: number;
  relevance_level: "高相关" | "中相关";
}

export interface EventFeed {
  symbol: string;
  events: EventFeedItem[];
  message: string | null;
  warnings: string[];
  updated_at: string;
  source: SourceInfo;
}

export interface InvestorQaItem {
  question: string;
  answer: string;
  published_at: string;
  keywords: string[];
  url: string;
  source: string;
}

export interface InvestorQa {
  symbol: string;
  items: InvestorQaItem[];
  message: string | null;
  updated_at: string;
  source: SourceInfo;
}

export type ThemeMode = "dark" | "light";

export interface KlineData {
  symbol: string;
  period: string;
  range: string;
  adjust: string;
  bars: KlineBar[];
  updated_at: string;
  source: SourceInfo;
}

export type KlinePeriod = "daily" | "weekly" | "monthly" | "yearly";
export type KlineRange = "1y" | "3y" | "5y" | "10y" | "all";
export type FinancialMode = "annual" | "quarterly";

export interface FinancialPeriod {
  period: string;
  label: string;
  report_date: string;
  revenue: number | null;
  revenue_yoy: number | null;
  parent_net_profit: number | null;
  parent_net_profit_yoy: number | null;
  deducted_net_profit: number | null;
  operating_cash_flow: number | null;
  operating_cash_flow_yoy: number | null;
  gross_margin: number | null;
  net_margin: number | null;
  eps: number | null;
  debt_ratio: number | null;
}

export interface FinancialPerformance {
  symbol: string;
  mode: FinancialMode;
  currency: "CNY";
  amount_unit: string;
  periods: FinancialPeriod[];
  summaries: string[];
  updated_at: string;
  source: SourceInfo;
}

export interface ApiError {
  code: string;
  message: string;
  source: string;
}

export interface ApiResponse<T> {
  status: "ok" | "error";
  data: T | null;
  error?: ApiError;
  source?: SourceInfo;
}
