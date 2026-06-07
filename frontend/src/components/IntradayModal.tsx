import {
  ColorType,
  createChart,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { getIntraday, getMoveAnalysis } from "../api";
import { usePersistentToggle } from "../hooks/usePersistentToggle";
import type {
  IntradayData,
  KlineBar,
  MoveAnalysis,
  StockSummary,
  ThemeMode,
} from "../types";
import { CollapseButton } from "./CollapseButton";
import { HighlightedText } from "./HighlightedText";

export function IntradayModal({
  stock,
  bar,
  bars,
  onClose,
  theme,
}: {
  stock: StockSummary;
  bar: KlineBar;
  bars: KlineBar[];
  onClose: () => void;
  theme: ThemeMode;
}) {
  const [data, setData] = useState<IntradayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<MoveAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisOpen, toggleAnalysis] = usePersistentToggle(
    "module:move-analysis",
    false,
  );
  const selectedIndex = bars.findIndex((item) => item.time === bar.time);
  const sinceSelection =
    selectedIndex >= 0 ? bars.slice(selectedIndex) : [bar];
  const latest = sinceSelection[sinceSelection.length - 1] ?? bar;
  const sinceChange = (latest.close / bar.close - 1) * 100;
  const intervalHigh = Math.max(...sinceSelection.map((item) => item.high));
  const intervalLow = Math.min(...sinceSelection.map((item) => item.low));

  const analyzeMove = async () => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      setAnalysis(await getMoveAnalysis(stock.symbol, bar.time));
    } catch (requestError) {
      setAnalysisError(
        requestError instanceof Error ? requestError.message : "异动原因分析失败",
      );
    } finally {
      setAnalysisLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getIntraday(stock.symbol, bar.time, controller.signal)
      .then(setData)
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError")
          return;
        setError(
          requestError instanceof Error ? requestError.message : "分时数据获取失败",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [stock.symbol, bar.time]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${stock.name} ${bar.time} 分时图`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-line bg-panel/95 p-5 backdrop-blur">
          <div>
            <h2 className="text-lg font-semibold text-white">{stock.name} 分时</h2>
            <p className="mt-1 font-mono text-sm text-slate-500">
              {stock.symbol} · {bar.time}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-slate-400 hover:text-white"
          >
            关闭
          </button>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <ModalMetric label="开盘" value={bar.open.toFixed(2)} />
            <ModalMetric label="收盘" value={bar.close.toFixed(2)} />
            <ModalMetric label="最高" value={bar.high.toFixed(2)} />
            <ModalMetric label="最低" value={bar.low.toFixed(2)} />
            <ModalMetric label="成交量" value={formatVolume(bar.volume)} />
            <ModalMetric label="涨跌幅" value={formatPercent(bar.change_percent)} />
            <ModalMetric label="振幅" value={formatPercent(bar.amplitude)} />
            <ModalMetric label="换手率" value={formatPercent(bar.turnover_rate)} />
          </div>
          <div className="mt-4 rounded-xl border border-line bg-slate-950/35 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-slate-300">
                从 {bar.time} 至今涨幅
              </div>
              <div
                className={`font-mono text-lg font-semibold ${
                  sinceChange >= 0 ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {sinceChange >= 0 ? "+" : ""}
                {sinceChange.toFixed(2)}%
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
              <ModalMetric label="选中日收盘" value={bar.close.toFixed(2)} />
              <ModalMetric label="最新收盘" value={latest.close.toFixed(2)} />
              <ModalMetric label="区间最高价" value={intervalHigh.toFixed(2)} />
              <ModalMetric label="区间最低价" value={intervalLow.toFixed(2)} />
            </div>
          </div>
          {loading && <ModalMessage>正在获取当天 1 分钟数据...</ModalMessage>}
          {error && <ModalMessage error>{error}</ModalMessage>}
          {!loading && !error && data && !data.available && (
            <ModalMessage>{data.message}</ModalMessage>
          )}
          {!loading && !error && data?.available && (
            <IntradayChart data={data} theme={theme} />
          )}
          {data && (
            <p className="mt-3 text-xs text-slate-600">
              来源：{data.source.name} · 更新：
              {new Date(data.updated_at).toLocaleString("zh-CN")}
              {data.available && data.average_estimated ? " · 黄色线为估算均价" : ""}
            </p>
          )}

          <section className="mt-6 border-t border-line pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">当日上涨/异动原因分析</h3>
                <p className="mt-1 text-xs text-slate-500">
                  检索目标日前后公开公告、互动易、新闻、研报与龙虎榜
                </p>
              </div>
              <CollapseButton open={analysisOpen} onClick={toggleAnalysis} />
            </div>
            {analysisOpen && (
              <>
                <button
                  type="button"
                  onClick={analyzeMove}
                  disabled={analysisLoading}
                  className="mt-4 rounded-lg border border-teal-400/30 bg-teal-400/[0.08] px-4 py-2 text-sm text-teal-300 disabled:opacity-50"
                >
                  {analysisLoading ? "正在检索..." : "分析当天上涨/下跌原因"}
                </button>
                {analysisError && (
                  <ResearchMessage error>{analysisError}</ResearchMessage>
                )}
                {analysis && (
                  <div className="mt-4 space-y-4">
                <div className="rounded-xl bg-slate-950/50 p-4">
                  <p className="text-sm leading-6 text-slate-200">
                    <HighlightedText text={analysis.summary} />
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    涨跌停判断：{analysis.limit_status}
                  </p>
                  <TagRow label="涉及业务" values={analysis.themes} />
                  <TagRow label="可能催化" values={analysis.catalysts} />
                </div>
                {analysis.evidence.map((item, index) => (
                  <article
                    key={`${item.source_type}-${item.published_at}-${index}`}
                    className="rounded-xl border border-line bg-slate-950/30 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded bg-slate-800 px-2 py-1 text-slate-300">
                        {item.source_type}
                      </span>
                      <span className="text-slate-600">{item.published_at}</span>
                    </div>
                    <h4 className="mt-2 text-sm font-medium text-slate-100">
                      <HighlightedText text={item.title} />
                    </h4>
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      <HighlightedText text={item.content} />
                    </p>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-block text-xs text-teal-300 hover:text-teal-200"
                    >
                      查看来源
                    </a>
                  </article>
                ))}
                {analysis.warnings.length > 0 && (
                  <p className="text-[11px] leading-5 text-amber-300/60">
                    部分来源获取失败：{analysis.warnings.join("；")}
                  </p>
                )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function TagRow({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-600">{label}</span>
      {values.map((value) => (
        <span
          key={value}
          className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300"
        >
          {value}
        </span>
      ))}
    </div>
  );
}

function ResearchMessage({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`mt-4 rounded-xl bg-slate-950/40 p-4 text-sm ${
        error ? "text-rose-400" : "text-slate-400"
      }`}
    >
      {children}
    </div>
  );
}

function IntradayChart({
  data,
  theme,
}: {
  data: IntradayData;
  theme: ThemeMode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || data.points.length === 0) return;
    const container = ref.current;
    const light = theme === "light";
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 440,
      layout: {
        background: { type: ColorType.Solid, color: light ? "#ffffff" : "#111827" },
        textColor: light ? "#475569" : "#94a3b8",
      },
      grid: {
        vertLines: { color: light ? "#e2e8f0" : "#1f2937" },
        horzLines: { color: light ? "#e2e8f0" : "#1f2937" },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    const price = chart.addLineSeries({
      color: "#38bdf8",
      lineWidth: 2,
      priceLineVisible: false,
    });
    price.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.28 } });
    price.setData(
      data.points.map((point) => ({
        time: toTimestamp(point.time),
        value: point.price,
      })),
    );
    const average = chart.addLineSeries({
      color: "#facc15",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    average.setData(
      data.points.map((point) => ({
        time: toTimestamp(point.time),
        value: point.average_price,
      })),
    );
    const volume = chart.addHistogramSeries({
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    volume.setData(
      data.points.map((point, index) => {
        const previous = data.points[index - 1]?.price ?? point.price;
        return {
          time: toTimestamp(point.time),
          value: point.volume,
          color:
            point.price > previous
              ? "#f43f5e88"
              : point.price < previous
                ? "#10b98188"
                : "#94a3b866",
        };
      }),
    );
    const tooltip = document.createElement("div");
    tooltip.className =
      "chart-tooltip pointer-events-none absolute z-20 hidden rounded-lg p-3 text-xs leading-5";
    container.appendChild(tooltip);
    chart.subscribeCrosshairMove((parameter) => {
      if (!parameter.time || !parameter.point) {
        tooltip.style.display = "none";
        return;
      }
      const timestamp =
        typeof parameter.time === "number"
          ? parameter.time
          : typeof parameter.time === "string"
            ? toTimestamp(parameter.time)
            : Date.UTC(
                parameter.time.year,
                parameter.time.month - 1,
                parameter.time.day,
              ) / 1000;
      const index = data.points.findIndex(
        (point) => toTimestamp(point.time) === timestamp,
      );
      if (index < 0) {
        tooltip.style.display = "none";
        return;
      }
      const point = data.points[index];
      const previous = data.points[index - 1]?.price ?? point.price;
      const minuteChange = previous ? ((point.price / previous) - 1) * 100 : 0;
      tooltip.innerHTML = `
        <div class="chart-tooltip-title font-semibold">${point.time.slice(11, 16)}</div>
        <div>价格 ${point.price.toFixed(2)}</div>
        <div>均价 ${point.average_price.toFixed(2)}${data.average_estimated ? "（估算）" : ""}</div>
        <div>分钟成交量 ${formatVolume(point.volume)}</div>
        <div>分钟涨跌幅 ${minuteChange.toFixed(2)}%</div>`;
      tooltip.style.display = "block";
      tooltip.style.left = `${Math.max(8, Math.min(parameter.point.x + 12, container.clientWidth - 190))}px`;
      tooltip.style.top = `${Math.max(8, parameter.point.y - 50)}px`;
    });
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(() =>
      chart.applyOptions({ width: container.clientWidth }),
    );
    observer.observe(container);
    return () => {
      observer.disconnect();
      tooltip.remove();
      chart.remove();
    };
  }, [data, theme]);
  return <div ref={ref} className="relative mt-5 overflow-hidden rounded-xl" />;
}

function ModalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-950/60 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-sm text-slate-200">{value}</div>
    </div>
  );
}

function ModalMessage({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`mt-5 flex h-72 items-center justify-center rounded-xl bg-slate-950/50 px-6 text-center text-sm ${
        error ? "text-rose-400" : "text-slate-400"
      }`}
    >
      {children}
    </div>
  );
}

function toTimestamp(value: string): UTCTimestamp {
  return Math.floor(new Date(value.replace(" ", "T") + "+08:00").getTime() / 1000) as UTCTimestamp;
}

function formatVolume(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(2)} 亿股`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(2)} 万股`;
  return `${value.toLocaleString("zh-CN")} 股`;
}

function formatPercent(value: number | null): string {
  return value === null ? "暂无数据" : `${value.toFixed(2)}%`;
}
