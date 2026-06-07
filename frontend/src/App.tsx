import { useCallback, useEffect, useState } from "react";
import {
  getFinancialPerformance,
  getCompanyProfile,
  getCompanyReports,
  getEventFeed,
  getFundFlow,
  getInvestorQa,
  getMarketFocus,
  getKline,
  getStockDetail,
} from "./api";
import { FinancialPerformance } from "./components/FinancialPerformance";
import { FundFlowPanel } from "./components/FundFlowPanel";
import { CompanyResearchSidebar } from "./components/CompanyResearchSidebar";
import { InvestorQaPanel } from "./components/InvestorQaPanel";
import { IntradayModal } from "./components/IntradayModal";
import { KlineChart } from "./components/KlineChart";
import { MarketNewsPage } from "./components/MarketNewsPage";
import { PeriodicReports } from "./components/PeriodicReports";
import { RecentStocks } from "./components/RecentStocks";
import { SearchPanel } from "./components/SearchPanel";
import { StockDetailCard } from "./components/StockDetailCard";
import { WatchlistGroups } from "./components/WatchlistGroups";
import { WatchlistModal } from "./components/WatchlistModal";
import { useRecentStocks } from "./hooks/useRecentStocks";
import { useWatchlistGroups } from "./hooks/useWatchlistGroups";
import type {
  FinancialMode,
  FinancialPerformance as FinancialData,
  CompanyProfile,
  CompanyReports,
  EventFeed,
  FundFlowData,
  InvestorQa,
  MarketFocus,
  KlineBar,
  KlineData,
  KlinePeriod,
  KlineRange,
  StockDetail,
  StockSummary,
  ThemeMode,
} from "./types";

export default function App() {
  const [activeView, setActiveView] = useState<"research" | "news">(() =>
    new URLSearchParams(window.location.search).get("view") === "news"
      ? "news"
      : "research",
  );
  const [selected, setSelected] = useState<StockSummary | null>(null);
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [kline, setKline] = useState<KlineData | null>(null);
  const [financials, setFinancials] = useState<FinancialData | null>(null);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [companyReports, setCompanyReports] = useState<CompanyReports | null>(null);
  const [marketFocus, setMarketFocus] = useState<MarketFocus | null>(null);
  const [eventFeed, setEventFeed] = useState<EventFeed | null>(null);
  const [investorQa, setInvestorQa] = useState<InvestorQa | null>(null);
  const [fundFlow, setFundFlow] = useState<FundFlowData | null>(null);
  const [selectedDailyBar, setSelectedDailyBar] = useState<KlineBar | null>(null);
  const [klinePeriod, setKlinePeriod] = useState<KlinePeriod>("daily");
  const [klineRange, setKlineRange] = useState<KlineRange>("1y");
  const [financialMode, setFinancialMode] = useState<FinancialMode>("annual");
  const [detailLoading, setDetailLoading] = useState(false);
  const [klineLoading, setKlineLoading] = useState(false);
  const [financialLoading, setFinancialLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [marketFocusLoading, setMarketFocusLoading] = useState(false);
  const [eventLoading, setEventLoading] = useState(false);
  const [investorQaLoading, setInvestorQaLoading] = useState(false);
  const [fundFlowLoading, setFundFlowLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [klineError, setKlineError] = useState<string | null>(null);
  const [financialError, setFinancialError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [marketFocusError, setMarketFocusError] = useState<string | null>(null);
  const [eventError, setEventError] = useState<string | null>(null);
  const [investorQaError, setInvestorQaError] = useState<string | null>(null);
  const [fundFlowError, setFundFlowError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() =>
    window.localStorage.getItem("theme") === "light" ? "light" : "dark",
  );
  const [watchlistModalOpen, setWatchlistModalOpen] = useState(false);
  const { recentStocks, addRecent, clearRecent } = useRecentStocks();
  const {
    groups: watchlistGroups,
    addGroup,
    renameGroup,
    deleteGroup,
    removeStock,
    setStockGroups,
  } = useWatchlistGroups();
  const analyzeLatest = useCallback(() => {
    const latest = kline?.bars[kline.bars.length - 1];
    if (latest) setSelectedDailyBar(latest);
  }, [kline]);
  const selectStock = useCallback((stock: StockSummary) => {
    setSelected(stock);
    setActiveView("research");
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
  }, []);
  const openMarketNews = useCallback(() => {
    setActiveView("news");
    const url = new URL(window.location.href);
    url.searchParams.set("view", "news");
    window.history.replaceState(null, "", url);
  }, []);
  const scrollToModule = useCallback((id: string) => {
    const target = document.getElementById(id);
    const container = document.querySelector<HTMLElement>("[data-main-scroll]");
    if (!target || !container) return;
    const top =
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      12;
    container.scrollTop = Math.max(0, top);
  }, []);
  const watchlistGroupCount = selected
    ? watchlistGroups.filter((group) =>
        group.stocks.some((stock) => stock.symbol === selected.symbol),
      ).length
    : 0;

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!selected) return;

    addRecent(selected);
    setDetail(null);
    setDetailError(null);

    const detailController = new AbortController();

    setDetailLoading(true);
    getStockDetail(selected.symbol, detailController.signal)
      .then(setDetail)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDetailError(error instanceof Error ? error.message : "行情获取失败");
      })
      .finally(() => {
        if (!detailController.signal.aborted) setDetailLoading(false);
      });

    return () => detailController.abort();
  }, [selected, addRecent]);

  useEffect(() => {
    if (!selected) return;

    setKline(null);
    setKlineError(null);
    const controller = new AbortController();
    setKlineLoading(true);
    getKline(
      selected.symbol,
      klinePeriod,
      klineRange,
      controller.signal,
    )
      .then(setKline)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setKlineError(error instanceof Error ? error.message : "K 线获取失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setKlineLoading(false);
      });

    return () => controller.abort();
  }, [selected, klinePeriod, klineRange]);

  useEffect(() => {
    if (!selected) return;
    setFundFlow(null);
    setFundFlowError(null);
    const controller = new AbortController();
    setFundFlowLoading(true);
    getFundFlow(selected.symbol, controller.signal)
      .then(setFundFlow)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFundFlowError(
          error instanceof Error ? error.message : "资金流获取失败",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setFundFlowLoading(false);
      });
    return () => controller.abort();
  }, [selected]);

  useEffect(() => {
    if (!selected) return;

    setFinancials(null);
    setFinancialError(null);
    const controller = new AbortController();
    setFinancialLoading(true);
    getFinancialPerformance(
      selected.symbol,
      financialMode,
      controller.signal,
    )
      .then(setFinancials)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFinancialError(
          error instanceof Error ? error.message : "财务数据获取失败",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setFinancialLoading(false);
      });

    return () => controller.abort();
  }, [selected, financialMode]);

  useEffect(() => {
    if (!selected) return;
    setCompanyProfile(null);
    setCompanyReports(null);
    setMarketFocus(null);
    setEventFeed(null);
    setInvestorQa(null);
    setProfileError(null);
    setReportsError(null);
    setMarketFocusError(null);
    setEventError(null);
    setInvestorQaError(null);
    const profileController = new AbortController();
    const reportsController = new AbortController();
    const marketFocusController = new AbortController();
    const eventController = new AbortController();
    const investorQaController = new AbortController();

    setProfileLoading(true);
    getCompanyProfile(selected.symbol, profileController.signal)
      .then(setCompanyProfile)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setProfileError(error instanceof Error ? error.message : "公司资料获取失败");
      })
      .finally(() => {
        if (!profileController.signal.aborted) setProfileLoading(false);
      });

    setReportsLoading(true);
    getCompanyReports(selected.symbol, reportsController.signal)
      .then(setCompanyReports)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setReportsError(error instanceof Error ? error.message : "报告列表获取失败");
      })
      .finally(() => {
        if (!reportsController.signal.aborted) setReportsLoading(false);
      });

    setMarketFocusLoading(true);
    getMarketFocus(selected.symbol, marketFocusController.signal)
      .then(setMarketFocus)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMarketFocusError(
          error instanceof Error ? error.message : "市场关注点获取失败",
        );
      })
      .finally(() => {
        if (!marketFocusController.signal.aborted) setMarketFocusLoading(false);
      });

    setEventLoading(true);
    getEventFeed(selected.symbol, eventController.signal)
      .then(setEventFeed)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setEventError(error instanceof Error ? error.message : "事件信息获取失败");
      })
      .finally(() => {
        if (!eventController.signal.aborted) setEventLoading(false);
      });

    setInvestorQaLoading(true);
    getInvestorQa(selected.symbol, investorQaController.signal)
      .then(setInvestorQa)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setInvestorQaError(
          error instanceof Error ? error.message : "董秘问答获取失败",
        );
      })
      .finally(() => {
        if (!investorQaController.signal.aborted) setInvestorQaLoading(false);
      });

    return () => {
      profileController.abort();
      reportsController.abort();
      marketFocusController.abort();
      eventController.abort();
      investorQaController.abort();
    };
  }, [selected]);

  return (
    <div className="app-shell h-screen overflow-hidden bg-[var(--color-page)]">
      <div className="mx-auto flex h-screen max-w-[1600px] overflow-hidden">
        <aside className="hidden h-screen w-72 shrink-0 overflow-y-auto overscroll-contain border-r border-line bg-[var(--color-surface)] p-5 lg:block">
          <div className="mb-8">
            <div className="text-sm font-semibold tracking-wide text-teal-300">
              F10 LAB
            </div>
            <div className="mt-1 text-xs text-slate-600">个人股票研究终端</div>
          </div>
          <button
            type="button"
            onClick={openMarketNews}
            className={`mb-5 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition ${
              activeView === "news"
                ? "border-teal-400/40 bg-teal-400/10 text-teal-300"
                : "border-line bg-panel text-slate-300 hover:bg-slate-800"
            }`}
          >
            <span>市场要闻</span>
            <span className="text-xs text-slate-600">7×24</span>
          </button>
          <SearchPanel onSelect={selectStock} />
          <RecentStocks
            stocks={recentStocks}
            activeSymbol={selected?.symbol}
            onSelect={selectStock}
            onClear={clearRecent}
          />
          <WatchlistGroups
            groups={watchlistGroups}
            activeSymbol={selected?.symbol}
            activeChangePercent={
              detail && selected?.symbol === detail.symbol
                ? detail.change_percent
                : null
            }
            onSelect={selectStock}
            onAddGroup={addGroup}
            onRenameGroup={renameGroup}
            onDeleteGroup={deleteGroup}
            onRemoveStock={removeStock}
          />
        </aside>

        <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden p-4 md:p-6 lg:p-8">
          <div className="mb-5 lg:hidden">
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={openMarketNews}
                className="rounded-lg border border-line bg-panel px-3 py-2 text-xs text-slate-300"
              >
                市场要闻
              </button>
            </div>
            <SearchPanel onSelect={selectStock} />
            <div className="mt-4 overflow-x-auto">
              <div className="flex gap-2">
                {recentStocks.map((stock) => (
                  <button
                    key={stock.symbol}
                    type="button"
                    onClick={() => selectStock(stock)}
                    className="shrink-0 rounded-lg border border-line bg-panel px-3 py-2 text-xs text-slate-300"
                  >
                    {stock.name} {stock.symbol}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <header className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-600">
                Market data workspace
              </p>
              <h1 className="mt-1 text-xl font-semibold text-slate-100">
                {activeView === "news" ? "全局财经资讯" : "A 股行情与技术走势"}
              </h1>
            </div>
            <button
              type="button"
              onClick={() =>
                setTheme((current) => (current === "dark" ? "light" : "dark"))
              }
              className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-slate-300"
            >
              {theme === "dark" ? "浅色主题" : "深色主题"}
            </button>
          </header>

          {activeView === "news" ? (
            <div className="min-h-0 flex-1">
              <MarketNewsPage />
            </div>
          ) : (
            <>
          <StockDetailCard
            data={detail}
            loading={detailLoading}
            error={detailError}
            selectedName={selected?.name}
            selectedSymbol={selected?.symbol}
            profile={companyProfile}
            profileLoading={profileLoading}
            profileError={profileError}
            watchlistGroupCount={watchlistGroupCount}
            onOpenWatchlist={() => setWatchlistModalOpen(true)}
          />
          <div className="mt-5 grid min-h-0 min-w-0 flex-1 gap-5 overflow-y-auto overscroll-contain xl:grid-cols-[minmax(0,1fr)_360px] xl:overflow-hidden">
            <div
              data-main-scroll
              className="min-w-0 xl:h-full xl:overflow-y-auto xl:overscroll-contain xl:pr-2"
            >
              <KlineChart
                data={kline}
                loading={klineLoading}
                error={klineError}
                period={klinePeriod}
                range={klineRange}
                onPeriodChange={setKlinePeriod}
                onRangeChange={setKlineRange}
                onDailyBarClick={setSelectedDailyBar}
                theme={theme}
              />
              <FundFlowPanel
                data={fundFlow}
                loading={fundFlowLoading}
                error={fundFlowError}
                theme={theme}
              />
              <FinancialPerformance
                data={financials}
                loading={financialLoading}
                error={financialError}
                mode={financialMode}
                onModeChange={setFinancialMode}
              />
              <InvestorQaPanel
                data={investorQa}
                loading={investorQaLoading}
                error={investorQaError}
              />
              <PeriodicReports
                symbol={selected?.symbol ?? null}
                reports={companyReports}
                loading={reportsLoading}
                error={reportsError}
              />
            </div>
            <div className="pb-8 xl:h-full xl:overflow-y-auto xl:overscroll-contain xl:pb-0 xl:pr-1">
              <CompanyResearchSidebar
                eventFeed={eventFeed}
                marketFocus={marketFocus}
                investorQa={investorQa}
                reports={companyReports}
                eventLoading={eventLoading}
                marketFocusLoading={marketFocusLoading}
                investorQaLoading={investorQaLoading}
                reportsLoading={reportsLoading}
                eventError={eventError}
                marketFocusError={marketFocusError}
                investorQaError={investorQaError}
                reportsError={reportsError}
                onAnalyzeLatest={analyzeLatest}
                onOpenInvestorQa={() => scrollToModule("investor-qa-section")}
                onOpenReports={() => scrollToModule("periodic-reports-section")}
              />
            </div>
          </div>
            </>
          )}
        </main>
      </div>
      {selected && selectedDailyBar && (
        <IntradayModal
          stock={selected}
          bar={selectedDailyBar}
          bars={kline?.bars ?? []}
          theme={theme}
          onClose={() => setSelectedDailyBar(null)}
        />
      )}
      {selected && watchlistModalOpen && (
        <WatchlistModal
          stock={selected}
          groups={watchlistGroups}
          onAddGroup={addGroup}
          onSave={(groupIds) => {
            setStockGroups(selected, groupIds);
            setWatchlistModalOpen(false);
          }}
          onClose={() => setWatchlistModalOpen(false)}
        />
      )}
    </div>
  );
}
