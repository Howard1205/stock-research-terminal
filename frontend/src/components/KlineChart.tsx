import {
  ColorType,
  CrosshairMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type UTCTimestamp,
} from "lightweight-charts";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { usePersistentToggle } from "../hooks/usePersistentToggle";
import type {
  KlineData,
  KlinePeriod,
  KlineRange,
  ThemeMode,
} from "../types";

interface KlineChartProps {
  data: KlineData | null;
  loading: boolean;
  error: string | null;
  period: KlinePeriod;
  range: KlineRange;
  onPeriodChange: (period: KlinePeriod) => void;
  onRangeChange: (range: KlineRange) => void;
  onDailyBarClick: (bar: KlineData["bars"][number]) => void;
  theme: ThemeMode;
}

type Indicator = "ma5" | "ma10" | "ma20" | "ma60" | "bbi";
type IndicatorColorKey = Indicator | "macdDif" | "macdDea";

const indicatorLabels: Record<Indicator, string> = {
  ma5: "MA5",
  ma10: "MA10",
  ma20: "MA20",
  ma60: "MA60",
  bbi: "BBI",
};

const defaultIndicatorColors: Record<IndicatorColorKey, string> = {
  ma5: "#facc15",
  ma10: "#38bdf8",
  ma20: "#c084fc",
  ma60: "#fb923c",
  bbi: "#5eead4",
  macdDif: "#f59e0b",
  macdDea: "#60a5fa",
};

interface RangeMeasurement {
  start: KlineData["bars"][number];
  end: KlineData["bars"][number];
  change: number;
  highestGain: number;
  highestPrice: number;
  lowestPrice: number;
  maxDrawdown: number;
  tradingDays: number;
  volume: number;
}

interface IndicatorSnapshot {
  bar: KlineData["bars"][number];
  volumeMa5: number | null;
  volumeMa10: number | null;
}

interface MacdPoint {
  time: string;
  dif: number;
  dea: number;
  macd: number;
  signal: "golden" | "death" | null;
}

interface ChipBin {
  low: number;
  high: number;
  midpoint: number;
  label: string;
  volume: number;
}

interface ChipAnalysis {
  bins: ChipBin[];
  maxVolume: number;
  totalVolume: number;
  currentPrice: number;
  averageCost: number;
  peak: ChipBin;
  profitRatio: number;
  cost70: [number, number];
  cost90: [number, number];
  concentration: number;
}

const periodOptions: Array<{ value: KlinePeriod; label: string }> = [
  { value: "daily", label: "日K" },
  { value: "weekly", label: "周K" },
  { value: "monthly", label: "月K" },
  { value: "yearly", label: "年K" },
];

const rangeOptions: Array<{ value: KlineRange; label: string }> = [
  { value: "1y", label: "1年" },
  { value: "3y", label: "3年" },
  { value: "5y", label: "5年" },
  { value: "10y", label: "10年" },
  { value: "all", label: "上市以来" },
];

export const KlineChart = memo(function KlineChart({
  data,
  loading,
  error,
  period,
  range,
  onPeriodChange,
  onRangeChange,
  onDailyBarClick,
  theme,
}: KlineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measuringRef = useRef(false);
  const measurementStartRef = useRef<KlineData["bars"][number] | null>(null);
  const onDailyBarClickRef = useRef(onDailyBarClick);
  const indicatorFrameRef = useRef<number | null>(null);
  const lineSeriesRef = useRef<Partial<Record<Indicator, ISeriesApi<"Line">>>>(
    {},
  );
  const visibleRangeRef = useRef<LogicalRange | null>(null);
  const dataIdentityRef = useRef("");
  const [visible, setVisible] = useState<Record<Indicator, boolean>>({
    ma5: true,
    ma10: true,
    ma20: true,
    ma60: false,
    bbi: true,
  });
  const [measuring, setMeasuring] = useState(false);
  const [measurementStart, setMeasurementStart] = useState<
    KlineData["bars"][number] | null
  >(null);
  const [measurement, setMeasurement] = useState<RangeMeasurement | null>(null);
  const [showChipDistribution, toggleChipDistribution] = usePersistentToggle(
    "kline:chip-distribution",
    false,
  );
  const [showMacd, toggleMacd] = usePersistentToggle("kline:macd", false);
  const [indicatorSnapshot, setIndicatorSnapshot] =
    useState<IndicatorSnapshot | null>(null);
  const [colorSettingsOpen, setColorSettingsOpen] = useState(false);
  const [indicatorColors, setIndicatorColors] = useState<
    Record<IndicatorColorKey, string>
  >(() => readIndicatorColors());
  const chipAvailable = Boolean(data && data.bars.length >= 20);
  const volumeAverages = useMemo(
    () => calculateVolumeAverages(data?.bars ?? []),
    [data],
  );
  const chipAnalysis = useMemo(
    () => analyzeChipDistribution(data?.bars ?? []),
    [data],
  );
  const macdData = useMemo(() => calculateMacd(data?.bars ?? []), [data]);
  const dataIdentity = data
    ? `${data.symbol}:${period}:${range}`
    : `${period}:${range}:empty`;

  useEffect(() => {
    if (dataIdentityRef.current !== dataIdentity) {
      dataIdentityRef.current = dataIdentity;
      visibleRangeRef.current = null;
    }
  }, [dataIdentity]);

  useEffect(() => {
    (Object.keys(indicatorLabels) as Indicator[]).forEach((indicator) => {
      lineSeriesRef.current[indicator]?.applyOptions({
        visible: visible[indicator],
        color: indicatorColors[indicator],
      });
    });
  }, [indicatorColors, visible]);

  useEffect(() => {
    window.localStorage.setItem(
      "kline:indicator-colors",
      JSON.stringify(indicatorColors),
    );
  }, [indicatorColors]);

  useEffect(() => {
    measuringRef.current = measuring;
  }, [measuring]);

  useEffect(() => {
    measurementStartRef.current = measurementStart;
  }, [measurementStart]);

  useEffect(() => {
    onDailyBarClickRef.current = onDailyBarClick;
  }, [onDailyBarClick]);

  useEffect(() => {
    const bars = data?.bars ?? [];
    setIndicatorSnapshot(
      bars.length
        ? createIndicatorSnapshot(bars[bars.length - 1], volumeAverages, bars.length - 1)
        : null,
    );
  }, [data, volumeAverages]);

  useEffect(() => {
    setMeasurementStart(null);
    setMeasurement(null);
  }, [data, period, range]);

  useEffect(() => {
    if (!containerRef.current || !data?.bars.length) return;

    const container = containerRef.current;
    const light = theme === "light";
    const chart: IChartApi = createChart(container, {
      width: container.clientWidth,
      height: 560,
      layout: {
        background: { type: ColorType.Solid, color: light ? "#ffffff" : "#111827" },
        textColor: light ? "#475569" : "#94a3b8",
      },
      grid: {
        vertLines: { color: light ? "#e2e8f0" : "#1f2937" },
        horzLines: { color: light ? "#e2e8f0" : "#1f2937" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: light ? "#cbd5e1" : "#243047" },
      timeScale: {
        borderColor: light ? "#cbd5e1" : "#243047",
        timeVisible: true,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#f43f5e",
      downColor: "#10b981",
      borderUpColor: "#f43f5e",
      borderDownColor: "#10b981",
      wickUpColor: "#f43f5e",
      wickDownColor: "#10b981",
      priceScaleId: "right",
    });
    candleSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.08, bottom: 0.28 },
    });
    candleSeries.setData(
      data.bars.map((bar) => ({
        time: toTimestamp(bar.time),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })),
    );

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });
    volumeSeries.setData(
      data.bars.map((bar) => ({
        time: toTimestamp(bar.time),
        value: bar.volume,
        color: bar.close >= bar.open ? "#f43f5e66" : "#10b98166",
      })),
    );

    const lines: Partial<Record<Indicator, ISeriesApi<"Line">>> = {};
    (Object.keys(indicatorLabels) as Indicator[]).forEach((indicator) => {
      const line = chart.addLineSeries({
        color: indicatorColors[indicator],
        lineWidth: indicator === "bbi" ? 2 : 1,
        priceLineVisible: false,
        lastValueVisible: false,
        visible: visible[indicator],
      });
      line.setData(
        data.bars
          .filter((bar) => bar[indicator] !== null)
          .map((bar) => ({
            time: toTimestamp(bar.time),
            value: bar[indicator] as number,
          })),
      );
      lines[indicator] = line;
    });
    lineSeriesRef.current = lines;

    if (visibleRangeRef.current) {
      chart.timeScale().setVisibleLogicalRange(visibleRangeRef.current);
    } else {
      chart.timeScale().fitContent();
    }
    const handleVisibleRangeChange = (logicalRange: LogicalRange | null) => {
      if (logicalRange) {
        visibleRangeRef.current = logicalRange;
        container.dataset.visibleFrom = String(logicalRange.from);
        container.dataset.visibleTo = String(logicalRange.to);
      }
    };
    chart
      .timeScale()
      .subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
    const tooltip = document.createElement("div");
    tooltip.className =
      "chart-tooltip pointer-events-none absolute z-20 hidden min-w-48 rounded-lg p-3 text-xs leading-5";
    container.appendChild(tooltip);
    const latestSnapshot = createIndicatorSnapshot(
      data.bars[data.bars.length - 1],
      volumeAverages,
      data.bars.length - 1,
    );
    const updateIndicator = (snapshot: IndicatorSnapshot) => {
      if (indicatorFrameRef.current !== null) {
        window.cancelAnimationFrame(indicatorFrameRef.current);
      }
      indicatorFrameRef.current = window.requestAnimationFrame(() => {
        setIndicatorSnapshot(snapshot);
        indicatorFrameRef.current = null;
      });
    };
    chart.subscribeCrosshairMove((parameter) => {
      if (!parameter.time || !parameter.point) {
        tooltip.style.display = "none";
        updateIndicator(latestSnapshot);
        return;
      }
      const hoveredTime =
        typeof parameter.time === "number"
          ? parameter.time
          : typeof parameter.time === "string"
            ? toTimestamp(parameter.time)
            : Date.UTC(
                parameter.time.year,
                parameter.time.month - 1,
                parameter.time.day,
              ) / 1000;
      const bar = data.bars.find(
        (item) => toTimestamp(item.time) === hoveredTime,
      );
      if (!bar) {
        tooltip.style.display = "none";
        updateIndicator(latestSnapshot);
        return;
      }
      const barIndex = data.bars.indexOf(bar);
      updateIndicator(createIndicatorSnapshot(bar, volumeAverages, barIndex));
      tooltip.innerHTML = `
        <div class="chart-tooltip-title mb-1 font-semibold">${bar.time}</div>
        <div class="grid grid-cols-2 gap-x-4">
          <span>开盘 ${formatPrice(bar.open)}</span><span>收盘 ${formatPrice(bar.close)}</span>
          <span>最高 ${formatPrice(bar.high)}</span><span>最低 ${formatPrice(bar.low)}</span>
          <span>成交量 ${formatVolume(bar.volume)}</span><span>涨跌 ${formatPercent(bar.change_percent)}</span>
          <span>振幅 ${formatPercent(bar.amplitude)}</span><span>换手 ${formatTurnover(bar.turnover_rate, bar.turnover_estimated)}</span>
          <span>MA5 ${formatPrice(bar.ma5)}</span><span>MA10 ${formatPrice(bar.ma10)}</span>
          <span>MA20 ${formatPrice(bar.ma20)}</span><span>MA60 ${formatPrice(bar.ma60)}</span>
          <span>BBI ${formatPrice(bar.bbi)}</span>
        </div>`;
      tooltip.style.display = "block";
      const tooltipWidth = 245;
      const left =
        parameter.point.x > container.clientWidth - tooltipWidth - 20
          ? parameter.point.x - tooltipWidth - 12
          : parameter.point.x + 12;
      tooltip.style.left = `${Math.max(8, left)}px`;
      tooltip.style.top = `${Math.max(8, parameter.point.y - 44)}px`;
    });
    chart.subscribeClick((parameter) => {
      if (parameter.time === undefined) return;
      const clickedTime =
        typeof parameter.time === "number"
          ? parameter.time
          : typeof parameter.time === "string"
            ? toTimestamp(parameter.time)
            : Date.UTC(
                parameter.time.year,
                parameter.time.month - 1,
                parameter.time.day,
              ) / 1000;
      const clickedBar = data.bars.find(
        (bar) => toTimestamp(bar.time) === clickedTime,
      );
      if (!clickedBar) return;
      if (measuringRef.current) {
        if (!measurementStartRef.current) {
          setMeasurementStart(clickedBar);
          setMeasurement(null);
        } else {
          setMeasurement(
            calculateMeasurement(
              data.bars,
              measurementStartRef.current,
              clickedBar,
            ),
          );
          setMeasurementStart(null);
        }
      } else if (period === "daily") {
        onDailyBarClickRef.current(clickedBar);
      }
    });
    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    observer.observe(container);

    return () => {
      if (indicatorFrameRef.current !== null) {
        window.cancelAnimationFrame(indicatorFrameRef.current);
        indicatorFrameRef.current = null;
      }
      chart
        .timeScale()
        .unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      lineSeriesRef.current = {};
      observer.disconnect();
      tooltip.remove();
      chart.remove();
    };
  }, [data, period, theme, volumeAverages]);

  return (
    <section className="mt-5 rounded-2xl border border-line bg-panel p-5 shadow-xl shadow-black/10">
      <div className="mb-4 flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
        <div>
          <h2 className="font-semibold text-white">
            {rangeOptions.find((item) => item.value === range)?.label}
            {periodOptions.find((item) => item.value === period)?.label}
          </h2>
          {data && (
            <p className="mt-1 text-xs text-slate-500">
              前复权 · 来源：{data.source.name} · 更新：
              {new Date(data.updated_at).toLocaleString("zh-CN")}
            </p>
          )}
          {period === "daily" && data && (
            <p className="mt-1 text-xs text-teal-300/70">
              {measuring
                ? measurementStart
                  ? `已选起点 ${measurementStart.time}，请点击终点`
                  : "区间测量：请点击起点K线"
                : "点击任意日 K 查看当天分时"}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {periodOptions.map((option) => (
              <ToggleButton
                key={option.value}
                active={period === option.value}
                onClick={() => onPeriodChange(option.value)}
              >
                {option.label}
              </ToggleButton>
            ))}
            <span className="mx-1 hidden h-7 w-px bg-line sm:block" />
            {rangeOptions.map((option) => (
              <ToggleButton
                key={option.value}
                active={range === option.value}
                onClick={() => onRangeChange(option.value)}
              >
                {option.label}
              </ToggleButton>
            ))}
          </div>
          <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
            <button
              type="button"
              onClick={() => {
                setMeasuring((current) => !current);
                setMeasurementStart(null);
                setMeasurement(null);
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                measuring
                  ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
                  : "border-line text-slate-500 hover:text-slate-300"
              }`}
            >
              区间测量
            </button>
            {(measurementStart || measurement) && (
              <button
                type="button"
                onClick={() => {
                  setMeasurementStart(null);
                  setMeasurement(null);
                  setMeasuring(false);
                }}
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300"
              >
                清除测量
              </button>
            )}
            <button
              type="button"
              disabled={!chipAvailable}
              title={
                chipAvailable
                  ? undefined
                  : "至少需要20根K线才能估算筹码分布"
              }
              onClick={() => {
                if (chipAvailable) {
                  toggleChipDistribution();
                }
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                showChipDistribution
                  ? "border-teal-400/50 bg-teal-400/10 text-teal-300"
                  : chipAvailable
                    ? "border-line text-slate-500 hover:text-slate-300"
                    : "cursor-not-allowed border-line text-slate-700 opacity-60"
              }`}
            >
              筹码分布
            </button>
            <button
              type="button"
              disabled={!data?.bars.length}
              onClick={toggleMacd}
              className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                showMacd
                  ? "border-fuchsia-400/50 bg-fuchsia-400/10 text-fuchsia-300"
                  : data?.bars.length
                    ? "border-line text-slate-500 hover:text-slate-300"
                    : "cursor-not-allowed border-line text-slate-700 opacity-60"
              }`}
            >
              MACD
            </button>
            <button
              type="button"
              onClick={() => setColorSettingsOpen((current) => !current)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                colorSettingsOpen
                  ? "border-sky-400/50 bg-sky-400/10 text-sky-300"
                  : "border-line text-slate-500 hover:text-slate-300"
              }`}
            >
              指标颜色
            </button>
            {(Object.keys(indicatorLabels) as Indicator[]).map((indicator) => (
            <button
              key={indicator}
              type="button"
              onClick={() =>
                setVisible((current) => ({
                  ...current,
                  [indicator]: !current[indicator],
                }))
              }
              className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                visible[indicator]
                  ? "border-slate-500 bg-slate-800 text-slate-100"
                  : "border-line bg-transparent text-slate-600"
              }`}
            >
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: indicatorColors[indicator] }}
              />
              {indicatorLabels[indicator]}
            </button>
            ))}
          </div>
          {colorSettingsOpen && (
            <IndicatorColorSettings
              colors={indicatorColors}
              onChange={(key, color) =>
                setIndicatorColors((current) => ({ ...current, [key]: color }))
              }
              onReset={() => setIndicatorColors(defaultIndicatorColors)}
            />
          )}
        </div>
      </div>

      {loading && <ChartMessage>正在获取真实 K 线...</ChartMessage>}
      {error && <ChartMessage error>{error}</ChartMessage>}
      {!loading && !error && !data && (
        <ChartMessage>选择股票后显示 K 线与成交量</ChartMessage>
      )}
      {!loading && !error && data && (
        <>
          <IndicatorStrip
            snapshot={indicatorSnapshot}
            colors={indicatorColors}
          />
          <div className="flex min-w-0 gap-2">
            <div
              ref={containerRef}
              className="relative min-w-0 flex-1 overflow-hidden rounded-lg"
            />
            {showChipDistribution && chipAnalysis && (
              <ChipDistribution analysis={chipAnalysis} />
            )}
          </div>
          {!chipAvailable && (
            <p className="mt-2 text-xs text-slate-600">
              当前K线少于20根，暂时无法估算筹码分布。
            </p>
          )}
          {measurement && <MeasurementCard measurement={measurement} />}
          {showMacd && (
            <MacdPanel
              data={macdData}
              theme={theme}
              difColor={indicatorColors.macdDif}
              deaColor={indicatorColors.macdDea}
            />
          )}
        </>
      )}
    </section>
  );
});

function IndicatorStrip({
  snapshot,
  colors,
}: {
  snapshot: IndicatorSnapshot | null;
  colors: Record<IndicatorColorKey, string>;
}) {
  const values: Array<{
    label: string;
    value: number | null;
    color: string;
    volume?: boolean;
  }> = snapshot
    ? [
        ...((Object.keys(indicatorLabels) as Indicator[]).map((indicator) => ({
          label: indicatorLabels[indicator],
          value: snapshot.bar[indicator],
          color: colors[indicator],
        })) as Array<{
          label: string;
          value: number | null;
          color: string;
        }>),
        {
          label: "VOL",
          value: snapshot.bar.volume,
          color: "#94a3b8",
          volume: true,
        },
        {
          label: "VOL MA5",
          value: snapshot.volumeMa5,
          color: "#f59e0b",
          volume: true,
        },
        {
          label: "VOL MA10",
          value: snapshot.volumeMa10,
          color: "#60a5fa",
          volume: true,
        },
      ]
    : [];
  return (
    <div className="mb-2 min-h-8 rounded-lg border border-line/70 bg-slate-950/30 px-3 py-2">
      {snapshot ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs">
          <span className="text-slate-500">{snapshot.bar.time}</span>
          {values.map((item) => (
            <span key={item.label} style={{ color: item.color }}>
              {item.label}:{" "}
              {item.volume ? formatVolume(item.value) : formatPrice(item.value)}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-xs text-slate-600">暂无指标数据</span>
      )}
    </div>
  );
}

function IndicatorColorSettings({
  colors,
  onChange,
  onReset,
}: {
  colors: Record<IndicatorColorKey, string>;
  onChange: (key: IndicatorColorKey, color: string) => void;
  onReset: () => void;
}) {
  const options: Array<{ key: IndicatorColorKey; label: string }> = [
    { key: "ma5", label: "MA5" },
    { key: "ma10", label: "MA10" },
    { key: "ma20", label: "MA20" },
    { key: "ma60", label: "MA60" },
    { key: "bbi", label: "BBI" },
    { key: "macdDif", label: "MACD DIF" },
    { key: "macdDea", label: "MACD DEA" },
  ];
  return (
    <div className="ml-auto mt-2 max-w-xl rounded-xl border border-line bg-slate-950/70 p-3">
      <div className="flex flex-wrap gap-3">
        {options.map((option) => (
          <label
            key={option.key}
            className="flex items-center gap-2 text-xs text-slate-400"
          >
            <input
              type="color"
              value={colors[option.key]}
              onChange={(event) => onChange(option.key, event.target.value)}
              className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            {option.label}
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={onReset}
        className="mt-3 text-xs text-slate-500 hover:text-slate-300"
      >
        恢复默认颜色
      </button>
    </div>
  );
}

function calculateMeasurement(
  bars: KlineData["bars"],
  first: KlineData["bars"][number],
  second: KlineData["bars"][number],
): RangeMeasurement {
  const firstIndex = bars.indexOf(first);
  const secondIndex = bars.indexOf(second);
  const startIndex = Math.min(firstIndex, secondIndex);
  const endIndex = Math.max(firstIndex, secondIndex);
  const selected = bars.slice(startIndex, endIndex + 1);
  const start = bars[startIndex];
  const end = bars[endIndex];
  let peak = start.high;
  let maxDrawdown = 0;
  selected.forEach((bar) => {
    peak = Math.max(peak, bar.high);
    maxDrawdown = Math.min(maxDrawdown, (bar.low / peak - 1) * 100);
  });
  return {
    start,
    end,
    change: (end.close / start.close - 1) * 100,
    highestGain: (Math.max(...selected.map((bar) => bar.high)) / start.close - 1) * 100,
    highestPrice: Math.max(...selected.map((bar) => bar.high)),
    lowestPrice: Math.min(...selected.map((bar) => bar.low)),
    maxDrawdown,
    tradingDays: selected.length,
    volume: selected.reduce((total, bar) => total + (bar.volume ?? 0), 0),
  };
}

function MeasurementCard({ measurement }: { measurement: RangeMeasurement }) {
  return (
    <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-slate-200">区间测量结果</div>
          <div className="mt-1 text-xs text-slate-600">点击“区间测量”可清除并重新选择</div>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`font-mono text-lg font-semibold ${
              measurement.change >= 0 ? "text-rose-400" : "text-emerald-400"
            }`}
          >
            {formatSignedPercent(measurement.change)}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
        <MeasureItem label="起始日期" value={measurement.start.time} />
        <MeasureItem label="结束日期" value={measurement.end.time} />
        <MeasureItem label="起始收盘价" value={measurement.start.close.toFixed(2)} />
        <MeasureItem label="结束收盘价" value={measurement.end.close.toFixed(2)} />
        <MeasureItem label="区间最高价" value={measurement.highestPrice.toFixed(2)} />
        <MeasureItem label="区间最低价" value={measurement.lowestPrice.toFixed(2)} />
        <MeasureItem label="区间最高涨幅" value={formatSignedPercent(measurement.highestGain)} />
        <MeasureItem label="最大回撤" value={formatSignedPercent(measurement.maxDrawdown)} />
        <MeasureItem label="交易天数" value={`${measurement.tradingDays} 天`} />
        <MeasureItem label="区间成交量合计" value={formatVolume(measurement.volume)} />
      </div>
    </div>
  );
}

function MeasureItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-slate-600">{label}</div>
      <div className="mt-1 font-mono text-slate-300">{value}</div>
    </div>
  );
}

const ChipDistribution = memo(function ChipDistribution({
  analysis,
}: {
  analysis: ChipAnalysis;
}) {
  const {
    bins,
    maxVolume,
    totalVolume,
    currentPrice,
    averageCost,
    peak,
    profitRatio,
    cost70,
    cost90,
    concentration,
  } = analysis;
  return (
    <aside className="flex h-[560px] w-56 shrink-0 flex-col rounded-lg border border-line bg-slate-950/35 p-3 2xl:w-64">
      <div>
        <div className="text-sm font-medium text-slate-200">筹码峰 / 成本分布</div>
        <div className="mt-1 text-[10px] leading-4 text-amber-300">
          估算筹码分布，非交易所真实筹码数据
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-y border-line/70 py-3">
        <CompactChipMetric label="获利比例" value={`${profitRatio.toFixed(1)}%`} />
        <CompactChipMetric label="平均成本" value={averageCost.toFixed(2)} />
        <CompactChipMetric
          label="90%成本区"
          value={`${cost90[0].toFixed(2)}-${cost90[1].toFixed(2)}`}
        />
        <CompactChipMetric
          label="70%成本区"
          value={`${cost70[0].toFixed(2)}-${cost70[1].toFixed(2)}`}
        />
        <CompactChipMetric label="集中度" value={`${concentration.toFixed(1)}%`} />
        <CompactChipMetric label="最大峰" value={peak.midpoint.toFixed(2)} />
      </div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col justify-between">
        {bins.map((bin) => (
          <div key={bin.label} className="flex items-center gap-1.5 text-[9px]">
            <span className="w-12 shrink-0 text-right font-mono text-slate-500">
              {bin.midpoint.toFixed(2)}
            </span>
            <div className="relative h-2.5 flex-1 overflow-hidden rounded-sm bg-slate-800/70">
              <div
                className={`h-full rounded-sm ${
                  Math.abs(bin.midpoint / currentPrice - 1) <= 0.02
                    ? "bg-amber-400"
                    : bin.midpoint <= currentPrice
                      ? "bg-rose-400/80"
                      : "bg-emerald-400/80"
                } ${bin === peak ? "ring-1 ring-white/70" : ""}`}
                style={{
                  width: `${Math.max(2, (bin.volume / maxVolume) * 100)}%`,
                }}
              />
            </div>
            <span className="w-8 text-right text-slate-600">
              {((bin.volume / totalVolume) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line/70 pt-2 text-[9px] text-slate-500">
        <Legend color="bg-rose-400" label="获利" />
        <Legend color="bg-emerald-400" label="套牢" />
        <Legend color="bg-amber-400" label="现价附近" />
      </div>
    </aside>
  );
});

function CompactChipMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] text-slate-600">{label}</div>
      <div className="mt-0.5 truncate font-mono text-[10px] text-slate-200">
        {value}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <i className={`h-1.5 w-1.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function buildChipDistribution(bars: KlineData["bars"]): ChipBin[] {
  if (bars.length < 20) return [];
  const min = Math.min(...bars.map((bar) => bar.low));
  const max = Math.max(...bars.map((bar) => bar.high));
  const count = 16;
  const size = (max - min) / count || 1;
  const volumes = Array.from({ length: count }, () => 0);
  bars.forEach((bar) => {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    const index = Math.min(count - 1, Math.max(0, Math.floor((typicalPrice - min) / size)));
    const turnoverWeight =
      bar.turnover_rate === null ? 1 : Math.max(bar.turnover_rate / 3, 0.2);
    volumes[index] += (bar.volume ?? 0) * turnoverWeight;
  });
  return volumes
    .map((volume, index) => ({
      low: min + index * size,
      high: min + (index + 1) * size,
      midpoint: min + (index + 0.5) * size,
      label: `${(min + index * size).toFixed(2)}-${(min + (index + 1) * size).toFixed(2)}`,
      volume,
    }))
    .reverse();
}

function analyzeChipDistribution(
  bars: KlineData["bars"],
): ChipAnalysis | null {
  const bins = buildChipDistribution(bars);
  if (!bins.length) return null;
  const totalVolume = bins.reduce((sum, item) => sum + item.volume, 0);
  if (totalVolume <= 0) return null;
  const maxVolume = Math.max(...bins.map((bin) => bin.volume), 1);
  const currentPrice = bars[bars.length - 1].close;
  const averageCost =
    bins.reduce((sum, bin) => sum + bin.midpoint * bin.volume, 0) / totalVolume;
  const peak = bins.reduce((best, bin) =>
    bin.volume > best.volume ? bin : best,
  );
  const profitableVolume = bins
    .filter((bin) => bin.midpoint <= currentPrice)
    .reduce((sum, bin) => sum + bin.volume, 0);
  const ascending = [...bins].sort((left, right) => left.midpoint - right.midpoint);
  const interval = (lower: number, upper: number): [number, number] => {
    let cumulative = 0;
    let low = ascending[0].low;
    let high = ascending[ascending.length - 1].high;
    let lowFound = false;
    ascending.forEach((bin) => {
      cumulative += bin.volume / totalVolume;
      if (!lowFound && cumulative >= lower) {
        low = bin.low;
        lowFound = true;
      }
      if (cumulative >= upper && high === ascending[ascending.length - 1].high) {
        high = bin.high;
      }
    });
    return [low, high];
  };
  const cost70 = interval(0.15, 0.85);
  const cost90 = interval(0.05, 0.95);
  return {
    bins,
    maxVolume,
    totalVolume,
    currentPrice,
    averageCost,
    peak,
    profitRatio: (profitableVolume / totalVolume) * 100,
    cost70,
    cost90,
    concentration:
      ((cost70[1] - cost70[0]) / (cost70[1] + cost70[0])) * 100,
  };
}

const MacdPanel = memo(function MacdPanel({
  data,
  theme,
  difColor,
  deaColor,
}: {
  data: MacdPoint[];
  theme: ThemeMode;
  difColor: string;
  deaColor: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState<MacdPoint | null>(
    data[data.length - 1] ?? null,
  );

  useEffect(() => {
    setSnapshot(data[data.length - 1] ?? null);
  }, [data]);

  useEffect(() => {
    if (!containerRef.current || !data.length) return;
    const container = containerRef.current;
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
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: light ? "#cbd5e1" : "#243047" },
      timeScale: {
        borderColor: light ? "#cbd5e1" : "#243047",
        timeVisible: true,
      },
    });
    const histogram = chart.addHistogramSeries({
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: "price", precision: 3, minMove: 0.001 },
    });
    histogram.setData(
      data.map((item) => ({
        time: toTimestamp(item.time),
        value: item.macd,
        color: item.macd >= 0 ? "#f43f5eaa" : "#10b981aa",
      })),
    );
    const difSeries = chart.addLineSeries({
      color: difColor,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    difSeries.setData(
      data.map((item) => ({
        time: toTimestamp(item.time),
        value: item.dif,
      })),
    );
    const signalPoints = data.filter((item) => item.signal);
    difSeries.setMarkers(
      signalPoints.map((item, index) => ({
        time: toTimestamp(item.time),
        position: item.signal === "golden" ? "belowBar" : "aboveBar",
        shape: item.signal === "golden" ? "arrowUp" : "arrowDown",
        color: item.signal === "golden" ? "#f43f5e" : "#10b981",
        text:
          index === signalPoints.length - 1
            ? item.signal === "golden"
              ? "金叉"
              : "死叉"
            : undefined,
        size: 0.55,
      })),
    );
    const deaSeries = chart.addLineSeries({
      color: deaColor,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    deaSeries.setData(
      data.map((item) => ({
        time: toTimestamp(item.time),
        value: item.dea,
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
        setSnapshot(data[data.length - 1]);
        return;
      }
      const item = data.find(
        (point) => toTimestamp(point.time) === Number(parameter.time),
      );
      if (!item) return;
      setSnapshot(item);
      tooltip.innerHTML = `
        <div class="chart-tooltip-title font-semibold">${item.time}</div>
        <div>DIF ${item.dif.toFixed(3)}</div>
        <div>DEA ${item.dea.toFixed(3)}</div>
        <div>MACD ${item.macd.toFixed(3)}</div>
        <div>技术信号 ${formatMacdSignal(item.signal)}</div>`;
      tooltip.style.display = "block";
      tooltip.style.left = `${Math.max(8, Math.min(parameter.point.x + 12, container.clientWidth - 150))}px`;
      tooltip.style.top = `${Math.max(8, parameter.point.y - 55)}px`;
    });
    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      tooltip.remove();
      chart.remove();
    };
  }, [data, deaColor, difColor, theme]);

  if (!data.length) {
    return (
      <div className="mt-3 rounded-lg border border-line p-8 text-center text-sm text-slate-500">
        当前K线数据不足，无法计算MACD。
      </div>
    );
  }
  const goldenCount = data.filter((item) => item.signal === "golden").length;
  const deathCount = data.filter((item) => item.signal === "death").length;
  return (
    <div className="mt-3 rounded-lg border border-line bg-slate-950/20 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs">
        <span className="font-sans font-medium text-slate-300">MACD (12,26,9)</span>
        <span className="text-slate-500">{snapshot?.time}</span>
        <span style={{ color: difColor }}>DIF: {snapshot?.dif.toFixed(3)}</span>
        <span style={{ color: deaColor }}>DEA: {snapshot?.dea.toFixed(3)}</span>
        <span className={snapshot && snapshot.macd >= 0 ? "text-rose-400" : "text-emerald-400"}>
          MACD: {snapshot?.macd.toFixed(3)}
        </span>
        {snapshot?.signal && (
          <span
            className={
              snapshot.signal === "golden"
                ? "text-rose-400"
                : "text-emerald-400"
            }
          >
            技术信号：{formatMacdSignal(snapshot.signal)}
          </span>
        )}
        <span className="text-slate-600">
          信号标记：金叉 {goldenCount} · 死叉 {deathCount}
        </span>
      </div>
      <div ref={containerRef} className="relative overflow-hidden rounded-lg" />
    </div>
  );
});

function calculateMacd(bars: KlineData["bars"]): MacdPoint[] {
  if (!bars.length) return [];
  const alpha12 = 2 / 13;
  const alpha26 = 2 / 27;
  const alpha9 = 2 / 10;
  let ema12 = bars[0].close;
  let ema26 = bars[0].close;
  let dea = 0;
  let previousDifference = 0;
  return bars.map((bar, index) => {
    if (index > 0) {
      ema12 = bar.close * alpha12 + ema12 * (1 - alpha12);
      ema26 = bar.close * alpha26 + ema26 * (1 - alpha26);
    }
    const dif = ema12 - ema26;
    dea = index === 0 ? dif : dif * alpha9 + dea * (1 - alpha9);
    const difference = dif - dea;
    const signal =
      index === 0
        ? null
        : previousDifference <= 0 && difference > 0
          ? "golden"
          : previousDifference >= 0 && difference < 0
            ? "death"
            : null;
    previousDifference = difference;
    return {
      time: bar.time,
      dif,
      dea,
      macd: (dif - dea) * 2,
      signal,
    };
  });
}

function formatMacdSignal(signal: MacdPoint["signal"]): string {
  if (signal === "golden") return "金叉";
  if (signal === "death") return "死叉";
  return "无";
}

function readIndicatorColors(): Record<IndicatorColorKey, string> {
  try {
    const raw = window.localStorage.getItem("kline:indicator-colors");
    if (!raw) return { ...defaultIndicatorColors };
    const parsed = JSON.parse(raw) as Partial<
      Record<IndicatorColorKey, string>
    >;
    return { ...defaultIndicatorColors, ...parsed };
  } catch {
    return { ...defaultIndicatorColors };
  }
}

function calculateVolumeAverages(bars: KlineData["bars"]) {
  const averages: Array<{ ma5: number | null; ma10: number | null }> = [];
  const rollingSum = (endIndex: number, count: number) => {
    if (endIndex + 1 < count) return null;
    let total = 0;
    for (let index = endIndex - count + 1; index <= endIndex; index += 1) {
      total += bars[index].volume ?? 0;
    }
    return total / count;
  };
  bars.forEach((_, index) => {
    averages.push({
      ma5: rollingSum(index, 5),
      ma10: rollingSum(index, 10),
    });
  });
  return averages;
}

function createIndicatorSnapshot(
  bar: KlineData["bars"][number],
  volumeAverages: Array<{ ma5: number | null; ma10: number | null }>,
  index: number,
): IndicatorSnapshot {
  return {
    bar,
    volumeMa5: volumeAverages[index]?.ma5 ?? null,
    volumeMa10: volumeAverages[index]?.ma10 ?? null,
  };
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs transition ${
        active
          ? "border-teal-400/60 bg-teal-400/10 text-teal-300"
          : "border-line text-slate-500 hover:text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

function ChartMessage({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`flex h-[560px] items-center justify-center rounded-lg bg-slate-950/40 text-sm ${
        error ? "text-rose-400" : "text-slate-500"
      }`}
    >
      {children}
    </div>
  );
}

function toTimestamp(date: string): UTCTimestamp {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000) as UTCTimestamp;
}

function formatPrice(value: number | null): string {
  return value === null ? "暂无数据" : value.toFixed(2);
}

function formatPercent(value: number | null): string {
  return value === null ? "暂无" : `${value.toFixed(2)}%`;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatVolume(value: number | null): string {
  if (value === null) return "暂无";
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(2)}万`;
  return value.toLocaleString("zh-CN");
}

function formatTurnover(value: number | null, estimated: boolean): string {
  if (value === null) return "暂无数据";
  return `${value.toFixed(2)}%${estimated ? "（估算）" : ""}`;
}
