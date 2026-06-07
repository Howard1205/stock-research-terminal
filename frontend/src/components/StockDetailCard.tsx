import { memo } from "react";
import type { CompanyProfile, StockDetail } from "../types";

interface StockDetailCardProps {
  data: StockDetail | null;
  loading: boolean;
  error: string | null;
  selectedName?: string;
  selectedSymbol?: string;
  profile: CompanyProfile | null;
  profileLoading: boolean;
  profileError: string | null;
  watchlistGroupCount: number;
  onOpenWatchlist: () => void;
}

export const StockDetailCard = memo(function StockDetailCard({
  data,
  loading,
  error,
  selectedName,
  selectedSymbol,
  profile,
  profileLoading,
  profileError,
  watchlistGroupCount,
  onOpenWatchlist,
}: StockDetailCardProps) {
  if (loading) {
    return <PanelMessage>正在获取真实行情...</PanelMessage>;
  }
  if (error) {
    return <PanelMessage error>{error}</PanelMessage>;
  }
  if (!data) {
    return (
      <PanelMessage>
        从左侧搜索一只 A 股，开始查看行情与技术走势。
      </PanelMessage>
    );
  }

  const positive = (data.change_percent ?? 0) >= 0;
  return (
    <section className="rounded-2xl border border-line bg-panel p-5 shadow-xl shadow-black/10">
      <div className="grid gap-5 xl:grid-cols-[230px_minmax(0,1fr)_minmax(260px,0.8fr)]">
        <div className="border-line xl:border-r xl:pr-5">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold text-white">
              {data.name || selectedName}
            </h1>
            <span className="font-mono text-sm text-slate-500">
              {data.symbol || selectedSymbol}
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-4xl font-semibold tabular-nums text-white">
              {formatNumber(data.price, 2)}
            </span>
            <span
              className={`text-lg font-medium tabular-nums ${
                positive ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {formatPercent(data.change_percent)}
            </span>
          </div>
          <div className="mt-4 text-xs leading-5 text-slate-500">
            <div>来源：{data.source.name}</div>
            <div>更新时间：{formatDateTime(data.updated_at)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Metric label="成交量" value={formatVolume(data.volume)} />
          <Metric label="总市值" value={formatMarketCap(data.market_cap)} />
          <Metric
            label="流通市值"
            value={formatMarketCap(data.circulating_market_cap)}
          />
          <Metric label="市盈率 PE" value={formatNumber(data.pe, 2)} />
          <Metric label="市净率 PB" value={formatNumber(data.pb, 2)} />
          <Metric label="换手率" value={formatPlainPercent(data.turnover_rate)} />
          <Metric label="振幅" value={formatPlainPercent(data.amplitude)} />
          <Metric label="量比" value={formatNumber(data.volume_ratio, 2)} />
          <Metric
            label="涨停 / 跌停"
            value={`${formatNumber(data.limit_up, 2)} / ${formatNumber(data.limit_down, 2)}`}
          />
        </div>

        <div className="border-line xl:border-l xl:pl-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500">所属行业</div>
              <div className="mt-1 text-sm font-medium text-slate-200">
                {data.industry ?? profile?.industry ?? "暂无数据"}
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenWatchlist}
              className="shrink-0 rounded-lg border border-amber-400/30 bg-amber-400/[0.07] px-3 py-1.5 text-xs text-amber-300"
            >
              {watchlistGroupCount > 0
                ? `已加入 ${watchlistGroupCount} 组`
                : "加入自选"}
            </button>
          </div>
          <div className="mt-3">
            <div className="text-xs text-slate-500">主营业务</div>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-300">
              {profileLoading
                ? "正在读取公司资料..."
                : profileError
                  ? "公司资料暂不可用"
                : profile?.main_business || "暂无可靠来源"}
            </p>
          </div>
          <div className="mt-3">
            <div className="text-xs text-slate-500">概念板块</div>
            <div className="mt-2 flex max-h-16 flex-wrap gap-1.5 overflow-hidden">
              {data.concepts.slice(0, 8).map((concept) => (
                <span
                  key={concept}
                  className="rounded-md border border-teal-400/15 bg-teal-400/[0.04] px-2 py-0.5 text-[11px] text-teal-200/80"
                >
                  {concept}
                </span>
              ))}
              {data.concepts.length === 0 && (
                <span className="text-xs text-slate-500">暂无数据</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line/70 bg-slate-950/45 px-3 py-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-0.5 truncate font-medium tabular-nums text-slate-100">
        {value}
      </div>
    </div>
  );
}

function PanelMessage({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <section className="flex min-h-44 items-center justify-center rounded-2xl border border-line bg-panel p-6 text-center">
      <p className={error ? "text-rose-400" : "text-slate-500"}>{children}</p>
    </section>
  );
}

function formatNumber(value: number | null, digits: number): string {
  return value === null
    ? "--"
    : value.toLocaleString("zh-CN", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
}

function formatPercent(value: number | null): string {
  if (value === null) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatPlainPercent(value: number | null): string {
  return value === null || value === undefined ? "暂无数据" : `${value.toFixed(2)}%`;
}

function formatVolume(value: number | null): string {
  if (value === null) return "--";
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(2)} 亿股`;
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(2)} 万股`;
  return `${value.toLocaleString("zh-CN")} 股`;
}

function formatMarketCap(value: number | null): string {
  if (value === null) return "--";
  return `${(value / 100_000_000).toFixed(2)} 亿元`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}
