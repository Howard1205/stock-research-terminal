import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { getMarketNews } from "../api";
import type { MarketNewsData } from "../types";

const filters = [
  "全部",
  "A股",
  "美股",
  "港股",
  "宏观",
  "科技",
  "AI算力",
  "半导体",
  "存储",
  "光模块",
  "机器人",
  "政策",
];

export const MarketNewsPage = memo(function MarketNewsPage() {
  const [data, setData] = useState<MarketNewsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("全部");
  const [page, setPage] = useState(1);
  const pageSize = 30;

  const load = useCallback(async (refresh = false) => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    try {
      setData(await getMarketNews(refresh, controller.signal));
    } catch {
      setError("暂无可用财经快讯数据");
    } finally {
      setLoading(false);
    }
    return () => controller.abort();
  }, []);

  useEffect(() => {
    void load(false);
    const timer = window.setInterval(() => void load(true), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  const filtered = useMemo(() => {
    if (filter === "全部") return data?.items ?? [];
    return (data?.items ?? []).filter((item) => {
      if (filter === "科技") {
        return item.sectors.some((sector) =>
          ["AI", "AI算力", "半导体", "存储", "光模块", "机器人", "美股科技"].includes(
            sector,
          ),
        );
      }
      if (filter === "政策") {
        return /政策|央行|证监会|监管|国务院|发改委/.test(
          `${item.title} ${item.summary}`,
        );
      }
      return item.markets.includes(filter) || item.sectors.includes(filter);
    });
  }, [data, filter]);
  const visible = filtered.slice(0, page * pageSize);

  return (
    <div className="h-full overflow-y-auto overscroll-contain pr-2">
      <section className="rounded-2xl border border-line bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-600">
              Global market intelligence
            </div>
            <h1 className="mt-1 text-xl font-semibold text-white">市场要闻</h1>
            <p className="mt-1 text-sm text-slate-500">
              多源公开财经快讯，独立于个股研究数据，每5分钟自动刷新
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
            className="rounded-lg border border-teal-400/30 bg-teal-400/[0.07] px-3 py-2 text-sm text-teal-300 disabled:opacity-50"
          >
            {loading ? "刷新中..." : "手动刷新"}
          </button>
        </div>
        {data && (
          <p className="mt-3 text-xs text-slate-600">
            来源：{data.source.name} · 更新：
            {new Date(data.updated_at).toLocaleString("zh-CN")}
          </p>
        )}
      </section>

      {loading && !data && <Message>正在聚合真实财经快讯...</Message>}
      {error && <Message>{error}</Message>}
      {data && (
        <>
          <DailySummary data={data} />
          <HotSectors data={data} />
          {data.warnings.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3 text-xs leading-5 text-amber-300">
              部分来源暂不可用：{data.warnings.join("；")}
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {filters.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  filter === item
                    ? "border-teal-400/50 bg-teal-400/10 text-teal-300"
                    : "border-line text-slate-500"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {visible.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-line bg-panel p-4"
              >
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={impactClass(item.impact)}>{item.impact}</span>
                  <span className="rounded bg-amber-400/[0.07] px-2 py-0.5 text-amber-300">
                    重要性：{item.importance}
                  </span>
                  <span className="text-slate-600">{item.published_at}</span>
                  <span className="text-slate-500">来源：{item.source}</span>
                </div>
                <h2 className="mt-2 text-base font-medium leading-6 text-slate-100">
                  {item.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {item.summary}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {[...item.markets, ...item.sectors].map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-sky-400/[0.07] px-2 py-0.5 text-xs text-sky-300"
                    >
                      {tag}
                    </span>
                  ))}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-xs text-teal-300"
                  >
                    查看原文
                  </a>
                </div>
              </article>
            ))}
          </div>
          {visible.length === 0 && <Message>当前筛选暂无可靠公开快讯</Message>}
          {visible.length < filtered.length && (
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              className="my-5 w-full rounded-lg border border-line py-2 text-sm text-slate-500"
            >
              加载更多
            </button>
          )}
        </>
      )}
    </div>
  );
});

function DailySummary({ data }: { data: MarketNewsData }) {
  return (
    <section className="mt-5 rounded-2xl border border-line bg-panel p-5">
      <h2 className="font-semibold text-white">今日市场摘要</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="text-xs text-slate-500">最重要的5条消息</div>
          <div className="mt-2 space-y-2">
            {data.daily_summary.top_items.map((item, index) => (
              <a
                key={`${item.title}-${index}`}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="flex gap-2 text-sm leading-5 text-slate-300"
              >
                <span className="text-slate-600">{index + 1}.</span>
                <span>{item.title}</span>
              </a>
            ))}
          </div>
        </div>
        <div className="space-y-3 text-sm">
          <SummaryLine label="对A股影响" value={data.daily_summary.a_share} />
          <SummaryLine label="对美股影响" value={data.daily_summary.us_share} />
          <SummaryLine label="对科技方向" value={data.daily_summary.technology} />
          <SummaryLine
            label="需关注风险"
            value={data.daily_summary.risks.join("；") || "暂未识别到明确风险标题"}
          />
        </div>
      </div>
    </section>
  );
}

function HotSectors({ data }: { data: MarketNewsData }) {
  return (
    <section className="mt-5 rounded-2xl border border-line bg-panel p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">今日热点板块</h2>
          <p className="mt-1 text-xs text-slate-500">
            东方财富行业/概念板块真实涨幅，原因优先匹配公开快讯证据
          </p>
        </div>
        <span className="text-xs text-slate-600">按涨幅排序</span>
      </div>
      {data.hot_sectors.length === 0 ? (
        <div className="mt-4 rounded-xl border border-line px-4 py-8 text-center text-sm text-slate-500">
          暂无板块数据
        </div>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {data.hot_sectors.map((sector) => (
            <article
              key={`${sector.type}-${sector.name}`}
              className="rounded-xl border border-line bg-slate-950/20 p-4"
            >
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-slate-100">
                  {sector.name}
                </span>
                <span className="rounded bg-sky-400/10 px-2 py-0.5 text-xs text-sky-300">
                  {sector.type}
                </span>
                <span
                  className={`ml-auto font-mono text-sm ${
                    sector.change_percent >= 0
                      ? "text-rose-400"
                      : "text-emerald-400"
                  }`}
                >
                  {sector.change_percent >= 0 ? "+" : ""}
                  {sector.change_percent.toFixed(2)}%
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                热度：
                {sector.heat === null ? "暂无数据" : `${sector.heat}%上涨`}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {sector.stocks.length > 0 ? (
                  sector.stocks.map((stock) => (
                    <span
                      key={`${stock.symbol}-${stock.name}`}
                      className="rounded-full border border-line px-2 py-1 text-xs text-slate-300"
                    >
                      {stock.name}
                      {stock.change_percent === null
                        ? ""
                        : ` ${stock.change_percent >= 0 ? "+" : ""}${stock.change_percent.toFixed(2)}%`}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-600">暂无成分股数据</span>
                )}
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {sector.reason}
              </p>
              <a
                href={sector.source_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-xs text-teal-300"
              >
                来源：{sector.source}
              </a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-600">{label}</div>
      <div className="mt-1 leading-5 text-slate-300">{value}</div>
    </div>
  );
}

function impactClass(impact: string) {
  if (impact.startsWith("利好"))
    return "rounded bg-rose-400/10 px-2 py-0.5 font-medium text-rose-400";
  if (impact.startsWith("利空"))
    return "rounded bg-emerald-400/10 px-2 py-0.5 font-medium text-emerald-400";
  return "rounded bg-slate-400/10 px-2 py-0.5 text-slate-500";
}

function Message({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`mt-5 rounded-xl border border-line bg-panel px-4 py-12 text-center text-sm ${
        error ? "text-rose-400" : "text-slate-500"
      }`}
    >
      {children}
    </div>
  );
}
