import { ColorType, createChart, type UTCTimestamp } from "lightweight-charts";
import { memo, useEffect, useRef, useState } from "react";
import type { FundFlowData, ThemeMode } from "../types";

export const FundFlowPanel = memo(function FundFlowPanel({
  data,
  loading,
  error,
  theme,
}: {
  data: FundFlowData | null;
  loading: boolean;
  error: string | null;
  theme: ThemeMode;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <section className="mt-4 rounded-xl border border-line bg-slate-950/25 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-slate-200">主力资金流向</h3>
          <p className="mt-1 text-xs text-slate-600">
            东方财富优先，同花顺公开数据回退；红色净流入，绿色净流出
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className={`rounded-lg border px-3 py-1.5 text-xs ${
            visible
              ? "border-teal-400/50 bg-teal-400/10 text-teal-300"
              : "border-line text-slate-500"
          }`}
        >
          {visible ? "隐藏资金流" : "显示资金流"}
        </button>
      </div>
      {visible && (
        <div className="mt-4">
          {loading && <Message>正在读取真实资金流...</Message>}
          {error && (
            <Message error>
              <div>暂无可靠资金流数据</div>
              <div className="mt-1 text-xs font-normal text-slate-600">
                AkShare / 东方财富接口返回失败：{error}
              </div>
            </Message>
          )}
          {!loading && !error && (!data || data.items.length === 0) && (
            <Message>暂无可靠资金流数据</Message>
          )}
          {!loading && !error && data && data.items.length > 0 && (
            <>
              <LatestFlow data={data} />
              <FundFlowChart data={data} theme={theme} />
              <p className="mt-2 text-[11px] text-slate-600">
                来源：{data.source.name}（{data.source.dataset}） · 更新：
                {new Date(data.updated_at).toLocaleString("zh-CN")}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
});

function LatestFlow({ data }: { data: FundFlowData }) {
  const latest = data.items[data.items.length - 1];
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
      <FlowMetric label="主力净流入" value={latest.main_inflow} positive />
      <FlowMetric label="主力净流出" value={latest.main_outflow} />
      <FlowMetric label="超大单净流入" value={latest.super_large_inflow} positive />
      <FlowMetric label="超大单净流出" value={latest.super_large_outflow} />
      <FlowMetric label="大单净流入" value={latest.large_inflow} positive />
      <FlowMetric label="大单净流出" value={latest.large_outflow} />
      <FlowMetric label="中单净额" value={latest.medium_net} positive={(latest.medium_net ?? 0) >= 0} />
      <FlowMetric label="小单净额" value={latest.small_net} positive={(latest.small_net ?? 0) >= 0} />
      <FlowMetric label="数据日期" text={latest.date} />
    </div>
  );
}

function FlowMetric({
  label,
  value = null,
  positive = false,
  text,
}: {
  label: string;
  value?: number | null;
  positive?: boolean;
  text?: string;
}) {
  return (
    <div className="rounded-lg border border-line/70 bg-panel px-3 py-2">
      <div className="text-[11px] text-slate-600">{label}</div>
      <div
        className={`mt-1 font-mono text-xs ${
          text
            ? "text-slate-300"
            : value === null
            ? "text-slate-500"
            : positive
              ? "text-rose-400"
              : "text-emerald-400"
        }`}
      >
        {text ?? formatMoney(value, false)}
      </div>
    </div>
  );
}

function FundFlowChart({
  data,
  theme,
}: {
  data: FundFlowData;
  theme: ThemeMode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const container = ref.current;
    const light = theme === "light";
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 230,
      layout: {
        background: { type: ColorType.Solid, color: light ? "#ffffff" : "#111827" },
        textColor: light ? "#475569" : "#94a3b8",
      },
      grid: {
        vertLines: { color: light ? "#e2e8f0" : "#1f2937" },
        horzLines: { color: light ? "#e2e8f0" : "#1f2937" },
      },
      rightPriceScale: { borderColor: light ? "#cbd5e1" : "#243047" },
      timeScale: { borderColor: light ? "#cbd5e1" : "#243047" },
    });
    const series = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceLineVisible: false,
    });
    const visibleItems = data.items.slice(-120);
    series.setData(
      visibleItems.map((item) => ({
        time: toTimestamp(item.date),
        value: item.main_net ?? 0,
        color: (item.main_net ?? 0) >= 0 ? "#f43f5e99" : "#10b98199",
      })),
    );
    chart.timeScale().fitContent();

    const tooltip = document.createElement("div");
    tooltip.className =
      "chart-tooltip pointer-events-none absolute z-20 hidden rounded-lg p-3 text-xs leading-5";
    container.appendChild(tooltip);
    chart.subscribeCrosshairMove((parameter) => {
      if (!parameter.time || !parameter.point) {
        tooltip.style.display = "none";
        return;
      }
      const item = visibleItems.find(
        (row) => toTimestamp(row.date) === Number(parameter.time),
      );
      if (!item) {
        tooltip.style.display = "none";
        return;
      }
      tooltip.innerHTML = `
        <div class="chart-tooltip-title font-semibold">${item.date}</div>
        <div>主力净额 ${formatMoney(item.main_net)}</div>
        <div>超大单净额 ${formatMoney(item.super_large_net)}</div>
        <div>大单净额 ${formatMoney(item.large_net)}</div>
        <div>中单净额 ${formatMoney(item.medium_net)}</div>
        <div>小单净额 ${formatMoney(item.small_net)}</div>`;
      tooltip.style.display = "block";
      tooltip.style.left = `${Math.max(8, Math.min(parameter.point.x + 12, container.clientWidth - 185))}px`;
      tooltip.style.top = `${Math.max(8, parameter.point.y - 70)}px`;
    });
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
  return <div ref={ref} className="relative overflow-hidden rounded-lg" />;
}

function Message({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div className={`py-10 text-center text-sm ${error ? "text-rose-400" : "text-slate-500"}`}>
      {children}
    </div>
  );
}

function formatMoney(value: number | null, signed = true): string {
  if (value === null) return "暂无数据";
  const sign = signed && value > 0 ? "+" : "";
  if (Math.abs(value) >= 100_000_000)
    return `${sign}${(value / 100_000_000).toFixed(2)}亿元`;
  return `${sign}${(value / 10_000).toFixed(2)}万元`;
}

function toTimestamp(date: string): UTCTimestamp {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000) as UTCTimestamp;
}
