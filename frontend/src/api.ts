import type {
  ApiResponse,
  CompanyProfile,
  CompanyReports,
  FinancialMode,
  FinancialPerformance,
  EventFeed,
  FundFlowData,
  InvestorQa,
  KlineData,
  KlinePeriod,
  KlineRange,
  IntradayData,
  MarketFocus,
  MarketNewsData,
  MoveAnalysis,
  ReportSummary,
  CompanyReport,
  StockDetail,
  StockSummary,
} from "./types";

async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new Error("无法连接后端，请确认 FastAPI 已在 8006 端口启动。");
  }

  if (!response.ok) {
    throw new Error(`后端请求失败：HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ApiResponse<T>;
  if (payload.status === "error" || payload.data === null) {
    throw new Error(payload.error?.message ?? "数据接口返回未知错误。");
  }
  return payload.data;
}

export function getCompanyProfile(symbol: string, signal?: AbortSignal) {
  return request<CompanyProfile>(
    `/api/company-profile?symbol=${encodeURIComponent(symbol)}`,
    signal,
  );
}

export function getCompanyReports(symbol: string, signal?: AbortSignal) {
  return request<CompanyReports>(
    `/api/company-reports?symbol=${encodeURIComponent(symbol)}`,
    signal,
  );
}

export function getIntraday(
  symbol: string,
  date: string,
  signal?: AbortSignal,
) {
  return request<IntradayData>(
    `/api/intraday?symbol=${encodeURIComponent(symbol)}&date=${encodeURIComponent(date)}`,
    signal,
  );
}

export function requestReportSummary(symbol: string, report: CompanyReport) {
  return fetch("/api/report-summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol,
      report_id: report.id,
      title: report.title,
      published_at: report.published_at,
      pdf_url: report.pdf_url,
      url: report.url,
    }),
  })
    .then((response) => response.json())
    .then(
      (
        payload: ApiResponse<ReportSummary>,
      ) => {
        if (payload.status === "error" || !payload.data) {
          throw new Error(payload.error?.message ?? "摘要任务启动失败");
        }
        return payload.data;
      },
    );
}

export function getMoveAnalysis(
  symbol: string,
  date: string,
  signal?: AbortSignal,
) {
  return request<MoveAnalysis>(
    `/api/move-analysis?symbol=${encodeURIComponent(symbol)}&date=${encodeURIComponent(date)}`,
    signal,
  );
}

export function getMarketFocus(symbol: string, signal?: AbortSignal) {
  return request<MarketFocus>(
    `/api/market-focus?symbol=${encodeURIComponent(symbol)}`,
    signal,
  );
}

export function getEventFeed(symbol: string, signal?: AbortSignal) {
  return request<EventFeed>(
    `/api/event-feed?symbol=${encodeURIComponent(symbol)}`,
    signal,
  );
}

export function getInvestorQa(symbol: string, signal?: AbortSignal) {
  return request<InvestorQa>(
    `/api/investor-qa?symbol=${encodeURIComponent(symbol)}`,
    signal,
  );
}

export function searchStocks(query: string, signal?: AbortSignal) {
  return request<StockSummary[]>(
    `/api/search-stocks?q=${encodeURIComponent(query)}`,
    signal,
  );
}

export function getStockDetail(symbol: string, signal?: AbortSignal) {
  return request<StockDetail>(
    `/api/stock-detail?symbol=${encodeURIComponent(symbol)}`,
    signal,
  );
}

export function getKline(
  symbol: string,
  period: KlinePeriod,
  range: KlineRange,
  signal?: AbortSignal,
) {
  return request<KlineData>(
    `/api/kline?symbol=${encodeURIComponent(symbol)}&period=${period}&range=${range}`,
    signal,
  );
}

export function getFundFlow(symbol: string, signal?: AbortSignal) {
  return request<FundFlowData>(
    `/api/fund-flow?symbol=${encodeURIComponent(symbol)}`,
    signal,
  );
}

export function getFinancialPerformance(
  symbol: string,
  mode: FinancialMode,
  signal?: AbortSignal,
) {
  return request<FinancialPerformance>(
    `/api/financial-performance?symbol=${encodeURIComponent(symbol)}&mode=${mode}`,
    signal,
  );
}

export function getMarketNews(refresh = false, signal?: AbortSignal) {
  return request<MarketNewsData>(
    `/api/market-news${refresh ? "?refresh=true" : ""}`,
    signal,
  );
}
